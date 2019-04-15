const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    generatePrivateKey,
    privateToPublic,
    toAddress,
    toBytes32Buffer,
    topUpTokens
} = require('./utils.js')
const { requestPayment, signPaymentRequest } = require('./client.js')

const MystToken = artifacts.require("MystToken")
const IdentityRegistry = artifacts.require("IdentityRegistry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
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
    return await ChannelImplementation.at(await genCreate2Address(identityHash, registry))
}

contract('Channel Contract full flow', ([txMaker, owner, ...otherAccounts]) => {
    let token, registry, channelImplementation
    before(async () => {
        token = await MystToken.new()
        const dexImplementation = await MystDex.new()
        channelImplementation = await ChannelImplementation.new(token.address, dexImplementation.address, owner, OneEther)
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
        const channelAddress = await genCreate2Address(identityHash, registry)
        const amount = OneToken.mul(new BN(8)) // 8 full tokens
        
        await token.transfer(channelAddress, amount, {from: userAccount})
        channelTotalBalance = await token.balanceOf(channelAddress)
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
        channel.deposit(hub, tokensToMint, {from: hubOperator})
        
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
        channel.deposit(userAccount, amount, {from: userAccount})

        // Check that channel state was updated properly
        const identityBalanceInChannel = await channel.identityBalance()
        identityBalanceInChannel.should.be.bignumber.equal(initialBalance.add(amount))
    })

    it("should properly update channel state", async () => {
        const channel = await getChannel(identityHash, registry)

        // hub request payment
        const { state, signature } = await requestPayment(hubPrivKey, 2.5, channel)
        const identitySignature = signPaymentRequest(privKey, state)
        channel.update(
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

    // TODO add tests for exiting channel (a few tests, green path and trying cheating)
    // TODO add tests for cooperative withdrawal (updateAndWithdraw)
    // TODO add tests for hub deposits
    // TODO add tests for updateIdentityBalance
    // TODO check for reentrancy in exit finalisation, topup and withdrawal
    // TODO add tests for chalenge period updates
    // TODO test foreign tokens and ethers recovery
})
