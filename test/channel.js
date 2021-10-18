/*
    This test is testing uni-directional, promise based payment channel implementation.
    Smart-contract code can be found in `contracts/ChannelImplementation.sol`.
*/

const { BN } = require('web3-utils')
const {
    topUpTokens,
    topUpEthers,
    setupDEX,
    sleep
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { generatePromise, signExitRequest, constructPayload } = require('./utils/client.js')

const MystToken = artifacts.require("TestMystToken")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const TestHermesImplementation = artifacts.require("TestHermesImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

contract('Channel Contract Implementation tests', ([txMaker, ...otherAccounts]) => {
    const identity = wallet.generateAccount()     // Generate identity
    const identityHash = identity.address         // identity hash = keccak(publicKey)[:20]
    const hermes = wallet.generateAccount()   // Generate hermes operator wallet
    let token, channel
    before(async () => {
        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        hermesImplementation = await TestHermesImplementation.new()
        await hermesImplementation.initialize(token.address, hermes.address, 0, OneToken, dex.address)
        channel = await TestChannelImplementation.new(token.address, dex.address, identityHash, hermesImplementation.address, Zero)

        // Give some ethers for gas for hermes
        topUpEthers(txMaker, hermes.address, OneEther)
    })

    it("already initialized channel should reject initialization request", async () => {
        expect(await channel.isInitialized()).to.be.true
        await channel.initialize(token.address, otherAccounts[3], identityHash, hermes.address).should.be.rejected
    })

    /**
     * Testing promise settlement functionality
     */

    it("should be able to topup channel", async () => {
        const userAccount = otherAccounts[0]
        const amount = OneToken.mul(new BN(8)) // 8 full tokens
        await topUpTokens(token, userAccount, amount)

        await token.transfer(channel.address, amount, { from: userAccount })
        const channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(amount)
    })

    it("should settle promise and send funds into beneficiary address", async () => {
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)

        const promise = generatePromise(amount, new BN(0), channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount))

        const hermesTotalBalance = await token.balanceOf(channelState.contractAddress)
        hermesTotalBalance.should.be.bignumber.equal(promise.amount)
    })

    it("should send given fee for transaction maker", async () => {
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const fee = OneToken.div(new BN(10)) // 0.1 tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)
        const hermesBalanceBefore = await token.balanceOf(channelState.contractAddress)

        const promise = generatePromise(amount, fee, channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount).sub(fee))

        const hermesBalanceAfter = await token.balanceOf(channelState.contractAddress)
        hermesBalanceAfter.should.be.bignumber.equal(hermesBalanceBefore.add(amount))

        const txMakerBalance = await token.balanceOf(txMaker)
        txMakerBalance.should.be.bignumber.equal(fee)
    })

    it("should not settle promise signed by wrong identity", async () => {
        const fakeIdentity = wallet.generateAccount()
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)

        const promise = generatePromise(amount, new BN(0), channelState, fakeIdentity)

        // Promise signed by wrong identity have to be rejected
        await channel.settlePromise(
            promise.amount,
            promise.fee,
            promise.lock,
            promise.signature
        ).should.be.rejected

        // Channel's balance should stay unchanged
        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore)
    })

    it("self signed promise should be rejected", async () => {
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })

        const promise = generatePromise(OneToken, new BN(0), channelState, hermes, identityHash)

        await wallet.sendTx(channel.address, constructPayload(promise), hermes).should.be.rejected
    })

    /**
     * Testing channel exit scenarios
     */

    let firstExitRequest
    it("should successfully request exit channel", async () => {
        const beneficiary = otherAccounts[1]
        const { validUntil, signature } = await signExitRequest(channel, beneficiary, identity)
        await channel.requestExit(beneficiary, validUntil, signature)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.beneficiary).to.be.equal(beneficiary)

        // This will be needed in later requests
        firstExitRequest = { beneficiary, validUntil, signature }
    })

    it("should fail requesting exit channel, when previous request is still active", async () => {
        const beneficiary = otherAccounts[2] // different beneficiary
        const { validUntil, signature } = await signExitRequest(channel, beneficiary, identity)
        await channel.requestExit(beneficiary, validUntil, signature).should.be.rejected

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.beneficiary).to.be.not.equal(beneficiary)
    })

    it("finalise exit should fail if requested before timelock", async () => {
        const expectedTxBlockNumber = (await web3.eth.getBlock('latest')).number
        const timelock = (await channel.exitRequest()).timelock
        expect(timelock.toNumber()).to.be.above(expectedTxBlockNumber)

        await channel.finalizeExit().should.be.rejected
    })

    it("during exit waiting period, receiving party should be able to settle latest promise", async () => {
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })
        const channelBalanceBefore = await token.balanceOf(channel.address)
        const hermesBalanceBefore = await token.balanceOf(channelState.contractAddress)

        const promise = generatePromise(OneToken, new BN(0), channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(OneToken))

        const hermesBalanceAfter = await token.balanceOf(channelState.contractAddress)
        hermesBalanceAfter.should.be.bignumber.equal(hermesBalanceBefore.add(OneToken))
    })

    it("should finalise exit request and send tokens into beneficiary address", async () => {
        const beneficiary = otherAccounts[1]
        const channelTokensBefore = await token.balanceOf(channel.address)
        const delay = 3.5 // seconds

        // Transaction's block time should be bigger or equal to timelock block
        const expectedTxBlockTime = (await web3.eth.getBlock('latest')).timestamp + delay
        const timelock = (await channel.exitRequest()).timelock
        expect(expectedTxBlockTime).to.be.at.least(timelock.toNumber())

        // Finalise request should be successful
        await sleep(delay * 1000) // we have to wait at least `delay` seconds before doing next transaction
        await channel.finalizeExit()

        // All the left in channel tokens have to be sent into beneficiary address
        expect((await token.balanceOf(channel.address)).toNumber()).to.be.equal(0)

        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal(channelTokensBefore)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.timelock.toNumber()).to.be.equal(0)
    })

    it("should fail requesting exit with already used signature", async () => {
        const { beneficiary, validUntil, signature } = firstExitRequest
        await channel.requestExit(beneficiary, validUntil, signature).should.be.rejected

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.timelock.toNumber()).to.be.equal(0)
    })

    it("should be possible to request new exit", async () => {
        const { beneficiary, validUntil, signature } = await signExitRequest(channel, otherAccounts[0], identity)
        await channel.requestExit(beneficiary, validUntil, signature)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.beneficiary).to.be.equal(beneficiary)
    })

    /**
     * Testing topup with ETH via DEX
     */
    it('should exchange ethers into tokens', async () => {
        const userAccount = otherAccounts[0]
        const initialChannelBalance = await token.balanceOf(channel.address)
        const ethersAmount = new BN('2000')
        const expectedTokens = new BN('3987')

        // Send some ethers into payment channel
        await channel.sendTransaction({
            from: userAccount,
            value: ethersAmount,
            gas: 200000
        })

        const channelBalance = await token.balanceOf(channel.address)
        channelBalance.should.be.bignumber.equal(initialChannelBalance.add(expectedTokens))
    })
})
