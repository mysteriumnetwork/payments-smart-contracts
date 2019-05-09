/*
    This test is testing uni-directional, promise based payment channel implementation.
    Smart-contract code can be found in `contracts/ChannelImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    toBytes32Buffer,
    topUpTokens,
    topUpEthers
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { generatePromise, constructPayload } = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const TestAccountantImplementation = artifacts.require("TestAccountantImplementation")

const OneToken = web3.utils.toWei(new BN(1), 'ether')
const OneEther = web3.utils.toWei('1', 'ether')

async function getChannel(identityHash, registry) {
    return await TestChannelImplementation.at(await genCreate2Address(identityHash, registry))
}

contract.only('Channel Contract Implementation tests', ([txMaker, ...otherAccounts]) => {
    const identity = wallet.generateAccount()     // Generate identity
    const identityHash = identity.address // identity hash = keccak(publicKey)[:20]
    const accountant = wallet.generateAccount()   // Generate hub
    let token, channel
    before(async () => {
        token = await MystToken.new()
        accountantImplementation = await TestAccountantImplementation.new(token.address, accountant.address)
        channel = await TestChannelImplementation.new(token.address, identityHash, accountantImplementation.address)

        // Give some ethers for gas for accountant
        topUpEthers(txMaker, accountant.address, OneEther)
    })

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
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

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
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

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
            promise.extraDataHash,
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

})
