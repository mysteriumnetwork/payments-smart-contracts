/*
    This test is testing uni-directional, promise based payment channel implementation.
    Smart-contract code can be found in `contracts/ChannelImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    topUpTokens,
    topUpEthers
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { generatePromise, signExitRequest, constructPayload } = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const TestAccountantImplementation = artifacts.require("TestAccountantImplementation")

const OneToken = OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

contract('Channel Contract Implementation tests', ([txMaker, ...otherAccounts]) => {
    const identity = wallet.generateAccount()     // Generate identity
    const identityHash = identity.address         // identity hash = keccak(publicKey)[:20]
    const accountant = wallet.generateAccount()   // Generate accountant operator wallet
    let token, channel
    before(async () => {
        token = await MystToken.new()
        accountantImplementation = await TestAccountantImplementation.new(token.address, accountant.address)
        channel = await TestChannelImplementation.new(token.address, identityHash, accountantImplementation.address, Zero)

        // Give some ethers for gas for accountant
        topUpEthers(txMaker, accountant.address, OneEther)
    })

    it("already initialized channel should reject initialization request", async () => {
        expect(await channel.isInitialized()).to.be.true
        await channel.initialize(token.address, otherAccounts[3], identityHash, accountant.address).should.be.rejected
    })

    /**
     * Testing promise settlement functionality
     */

    it("should be able to topup channel", async () => {
        const userAccount = otherAccounts[0]
        const amount = OneToken.mul(new BN(8)) // 8 full tokens
        await topUpTokens(token, userAccount, amount)

        await token.transfer(channel.address, amount, {from: userAccount})
        const channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(amount)
    })

    it("should settle promise and send funds into beneficiary address", async () => {
        const channelState = Object.assign({}, await channel.party(), {channelId: channel.address})
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)
    
        const promise = generatePromise(amount, new BN(0), channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount))

        const accountantTotalBalance = await token.balanceOf(channelState.beneficiary)
        accountantTotalBalance.should.be.bignumber.equal(promise.amount)
    })

    it("should send given fee for transaction maker", async () => {
        const channelState = Object.assign({}, await channel.party(), {channelId: channel.address})
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const fee = OneToken.div(new BN(10)) // 0.1 tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)
        const accountantBalanceBefore = await token.balanceOf(channelState.beneficiary)

        const promise = generatePromise(amount, fee, channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount).sub(fee))

        const accountantBalanceAfter = await token.balanceOf(channelState.beneficiary)
        accountantBalanceAfter.should.be.bignumber.equal(accountantBalanceBefore.add(amount))

        const txMakerBalance = await token.balanceOf(txMaker)
        txMakerBalance.should.be.bignumber.equal(fee)
    })

    it("should not settle promise signed by wrong identity", async () => {
        const fakeIdentity = wallet.generateAccount()
        const channelState = Object.assign({}, await channel.party(), {channelId: channel.address})
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
        const channelState = Object.assign({}, await channel.party(), {channelId: channel.address})

        const promise = generatePromise(OneToken, new BN(0), channelState, accountant)

        await wallet.sendTx(channel.address, constructPayload(promise), accountant).should.be.rejected
    })

    /**
     * Testing channel exit scenarios
     */

    let firstExitRequest
    it("should successfully request exit channel", async () => {
        const beneficiary = otherAccounts[1]
        const {validUntil, signature} = await signExitRequest(channel, beneficiary, identity)
        await channel.requestExit(beneficiary, validUntil, signature)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.beneficiary).to.be.equal(beneficiary)

        // This will be needed in later requests
        firstExitRequest = {beneficiary, validUntil, signature}
    })

    it("should fail requesting exit channel, when previous request is still active", async () => {
        const beneficiary = otherAccounts[2] // different beneficiary
        const {validUntil, signature} = await signExitRequest(channel, beneficiary, identity)
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
        const channelState = Object.assign({}, await channel.party(), {channelId: channel.address})
        const channelBalanceBefore = await token.balanceOf(channel.address)
        const accountantBalanceBefore = await token.balanceOf(channelState.beneficiary)

        const promise = generatePromise(OneToken, new BN(0), channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(OneToken))

        const accountantBalanceAfter = await token.balanceOf(channelState.beneficiary)
        accountantBalanceAfter.should.be.bignumber.equal(accountantBalanceBefore.add(OneToken))
    })

    it("should finalise exit request and send tokens into beneficiary address", async () => {
        const beneficiary = otherAccounts[1]
        const channelTokensBefore = await token.balanceOf(channel.address)

        // Transaction's block number should be bigger or equal to timelock block
        const expectedTxBlockNumber = (await web3.eth.getBlock('latest')).number + 1
        const timelock = (await channel.exitRequest()).timelock
        expect(expectedTxBlockNumber).to.be.at.least(timelock.toNumber())

        // Finalise request should be successful
        await channel.finalizeExit()

        // All the left in channel tokens have to be sent into beneficiary address
        expect((await token.balanceOf(channel.address)).toNumber()).to.be.equal(0)

        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal(channelTokensBefore)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.timelock.toNumber()).to.be.equal(0)
    })

    it("should fail requesting exit with already used signature", async () => {
        const {beneficiary, validUntil, signature} = firstExitRequest
        await channel.requestExit(beneficiary, validUntil, signature).should.be.rejected

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.timelock.toNumber()).to.be.equal(0)
    })

    it("should be possible to request new exit", async () => {
        const {beneficiary, validUntil, signature} = await signExitRequest(channel, otherAccounts[0], identity)
        await channel.requestExit(beneficiary, validUntil, signature)

        const exitRequest = await channel.exitRequest()
        expect(exitRequest.beneficiary).to.be.equal(beneficiary)
    })
})
