const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    generatePrivateKey,
    privateToPublic,
    toAddress,
    toBytes32Buffer,
    topUpTokens
} = require('./utils.js')
const { requestPayment, signPaymentRequest, requestWithdrawal, signWithdrawRequest } = require('./client.js')

const MystToken = artifacts.require("MystToken")
const IdentityRegistry = artifacts.require("IdentityRegistry")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const MystDex = artifacts.require("MystDEX")

// Generate identity
const privKey = generatePrivateKey()
const pubKey = privateToPublic(privKey)
const identityHash = toAddress(pubKey)

// Generate hub
const hubPrivKey = generatePrivateKey()
const hubPubKey = privateToPublic(hubPrivKey)
const hub = toAddress(hubPubKey)

const OneToken = web3.utils.toWei(new BN(1), 'ether')
const OneEther = web3.utils.toWei('1', 'ether')

async function getChannel(identityHash, registry) {
    return await TestChannelImplementation.at(await genCreate2Address(identityHash, registry))
}

contract.only('Channel Contract full flow', ([txMaker, owner, ...otherAccounts]) => {
    let token, registry, channelImplementation
    before(async () => {
        token = await MystToken.new()
        const dexImplementation = await MystDex.new()
        channelImplementation = await TestChannelImplementation.new(token.address, dexImplementation.address, owner, OneEther)
        registry = await IdentityRegistry.new(token.address, dexImplementation.address, OneToken, channelImplementation.address)
    })

    it("should fail registering identity without paying registration fee", async () => {
        await registry.registerIdentity(identityHash).should.be.rejected
    })

    it("should register identity by paying fee", async () => {
        const userAccount = otherAccounts[0]

        // Mint 100 tokens into user account
        const tokensToMint = OneToken.mul(new BN(100))
        await token.mint(userAccount, tokensToMint)
        const userTokenBalance = await token.balanceOf(userAccount)
        userTokenBalance.should.be.bignumber.equal(tokensToMint)

        // Approve registry to use tokens
        await token.approve(registry.address, OneToken, {from: userAccount})

        // Register identity
        await registry.registerIdentity(identityHash, hub, {from: userAccount})
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it("should be able to topup channel", async () => {
        const userAccount = otherAccounts[0]
        const channel = await getChannel(identityHash, registry)
        const amount = OneToken.mul(new BN(8)) // 8 full tokens
        
        await token.transfer(channel.address, amount, {from: userAccount})
        channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(amount)
    })

    it("should be able to deposit for hub", async () => {
        const hubOperator = otherAccounts[1]
        const channel = await getChannel(identityHash, registry)
        const initialBalance = await token.balanceOf(channel.address)

        // Mint 100 tokens into hub account
        const tokensToMint = OneToken.mul(new BN(100))
        topUpTokens(token, hubOperator, tokensToMint)

        // Approve registry to use tokens
        await token.approve(channel.address, tokensToMint, {from: hubOperator})

        // Deposit tokens into channel
        await channel.deposit(hub, tokensToMint, {from: hubOperator})

        // Check that tokens were deposited into channel
        const channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(initialBalance.add(tokensToMint))

        // Check that channel state was updated properly
        const hubBalanceInChannel = await channel.hubBalance()
        hubBalanceInChannel.should.be.bignumber.equal(tokensToMint)
    })
 
    it("deposits not from hub should be counted as identity's deposits", async () => {
        const userAccount = otherAccounts[0]
        const channel = await getChannel(identityHash, registry)
        const initialBalance = await channel.identityBalance()

        const amount = OneToken.mul(new BN(5)) // 5 full tokens

        // Approve registry to use tokens
        await token.approve(channel.address, amount, {from: userAccount})

        // Deposit tokens into channel
        await channel.deposit(userAccount, amount, {from: userAccount})

        // Check that channel state was updated properly
        const identityBalanceInChannel = await channel.identityBalance()
        identityBalanceInChannel.should.be.bignumber.equal(initialBalance.add(amount))
    })

    it("should properly update channel state", async () => {
        const channel = await getChannel(identityHash, registry)

        // hub request payment
        const { state, signature } = await requestPayment(hubPrivKey, 2.5, channel)

        // payer agree
        const identitySignature = signPaymentRequest(privKey, state)

        // anyone (but usually payer) can send tx into blockchain
        await channel.update(
            toBytes32Buffer(state.identityBalance),
            toBytes32Buffer(state.hubBalance),
            toBytes32Buffer(state.sequence),
            identitySignature,
            signature
        )

        const identityBalance = await channel.identityBalance()
        identityBalance.should.be.bignumber.equal(state.identityBalance)

        const hubBalance = await channel.hubBalance()
        hubBalance.should.be.bignumber.equal(state.hubBalance)

        const sequence = await channel.lastSequence()
        sequence.should.be.bignumber.equal(state.sequence)

        const channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(state.totalBalance)
    })

    // TODO add tests for cooperative withdrawal (updateAndWithdraw)
    it("should imidiately withdraw funds when other party is cooperating", async () => {
        const channel = await getChannel(identityHash, registry)

        // identity request withdraw
        const amount = new BN((OneToken * 0.5).toString())
        const { state, signature } = await requestWithdrawal(privKey, amount, 3600, channel)

        // hub agrees on withdrawal request
        const hubSignature = signWithdrawRequest(hubPrivKey, state)

        // anyone (but usually requester) can send tx into blockchain
        await channel.updateAndWithdraw(
            toBytes32Buffer(state.identityBalance),
            toBytes32Buffer(state.hubBalance),
            toBytes32Buffer(state.identityWithdraw),
            toBytes32Buffer(state.hubWithdraw),
            toBytes32Buffer(state.sequence),
            toBytes32Buffer(state.deadline),
            signature,
            hubSignature
        )

        const identityBalance = await channel.identityBalance()
        identityBalance.should.be.bignumber.equal(state.identityBalance)

        const hubBalance = await channel.hubBalance()
        hubBalance.should.be.bignumber.equal(state.hubBalance)

        const sequence = await channel.lastSequence()
        sequence.should.be.bignumber.equal(state.sequence)

        const channelTotalBalance = await token.balanceOf(channel.address)
        channelTotalBalance.should.be.bignumber.equal(state.totalBalance)

        const identityTokens = await token.balanceOf(identityHash)
        identityTokens.should.be.bignumber.equal(amount)

        // Second attempt sending same withdraw request should fail
        await channel.updateAndWithdraw(
            toBytes32Buffer(state.identityBalance),
            toBytes32Buffer(state.hubBalance),
            toBytes32Buffer(state.identityWithdraw),
            toBytes32Buffer(state.hubWithdraw),
            toBytes32Buffer(state.sequence),
            toBytes32Buffer(state.deadline),
            signature,
            hubSignature
        ).should.be.rejected
    })

    it("should fail to update channel when someone send tokens in the middle of process", async () => {
        const userAccount = otherAccounts[1]
        const channel = await getChannel(identityHash, registry)
        const { state, signature } = await requestPayment(hubPrivKey, 7, channel)
        const identitySignature = signPaymentRequest(privKey, state)

        // Mint 100 tokens into hub account and send part of them into channel
        const tokensToMint = OneToken.mul(new BN(70))
        await topUpTokens(token, userAccount, tokensToMint)
        await token.transfer(channel.address, OneToken.mul(new BN(25)), {from: userAccount})

        // transaction sent into blockchain should fail because of wrong totalChannelBalance
        await channel.update(
            toBytes32Buffer(state.identityBalance),
            toBytes32Buffer(state.hubBalance),
            toBytes32Buffer(state.sequence),
            identitySignature,
            signature
        ).should.be.rejected
    })

    it("should fail to update channel when someone send tokens in the middle of process", async () => {
        const userAccount = otherAccounts[1]
        const channel = await getChannel(identityHash, registry)

        // rebalance onchain state
        await channel.updateIdentityBalance()

        // identity request withdraw
        const amount = new BN((OneToken * 5).toString())
        const { state, signature } = await requestWithdrawal(privKey, amount, 3600, channel)

        // hub agrees on withdrawal request
        const hubSignature = signWithdrawRequest(hubPrivKey, state)

        // deposit some tokens before update transaction
        await token.approve(channel.address, amount, {from: userAccount})
        await channel.deposit(hub, amount, {from: userAccount})

        // transaction sent into blockchain should fail because of wrong totalChannelBalance
        await channel.updateAndWithdraw(
            toBytes32Buffer(state.identityBalance),
            toBytes32Buffer(state.hubBalance),
            toBytes32Buffer(state.identityWithdraw),
            toBytes32Buffer(state.hubWithdraw),
            toBytes32Buffer(state.sequence),
            toBytes32Buffer(state.deadline),
            signature,
            hubSignature
        ).should.be.rejected
    })
    // TODO add tests for exiting channel (a few tests, green path and trying cheating)
    // TODO check for reentrancy in exit finalisation, topup and withdrawal
    // TODO add tests for chalenge period updates
    // TODO test foreign tokens and ethers recovery
})
