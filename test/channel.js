/*
    This test is testing uni-directional, promise based payment channel implementation.
    Smart-contract code can be found in `contracts/ChannelImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    toBytes32Buffer,
    topUpTokens
} = require('./utils/index.js')
const { generateWallet } = require('./utils/wallet.js')
const { generatePromise } = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const TestAccountantImplementation = artifacts.require("TestAccountantImplementation")

const state = {} // a.k.a. database

const OneToken = web3.utils.toWei(new BN(1), 'ether')
const OneEther = web3.utils.toWei('1', 'ether')

async function getChannel(identityHash, registry) {
    return await TestChannelImplementation.at(await genCreate2Address(identityHash, registry))
}

contract.only('Channel Contract Implementation tests', ([txMaker, ...otherAccounts]) => {
    const identity = generateWallet()     // Generate identity
    const identityHash = identity.address // identity hash = keccak(publicKey)[:20]
    const accountant = generateWallet()   // Generate hub
    let token, channel
    before(async () => {
        token = await MystToken.new()
        accountantImplementation = await TestAccountantImplementation.new(token.address, accountant.address)
        channel = await TestChannelImplementation.new(token.address, identity.address, accountantImplementation.address)
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
        const channelParty = await channel.party()
        state[channel.address] = { balance: channelParty.settled, channelId: channel.address }
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)
    
        const promise = generatePromise(amount, new BN(0), state[channel.address], identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount))

        const accountantTotalBalance = await token.balanceOf(channelParty.beneficiary)
        accountantTotalBalance.should.be.bignumber.equal(promise.amount)
    })

})
