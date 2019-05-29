/*
    In this file we'll have a few end-to-end workflows which emulates all necesary 
    on-chain and off-chain interactions from registering identity, to settlement of received funds
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    topUpTokens,
    topUpEthers,
    generateChannelId
} = require('./utils/index.js')
const {
    createExchangeMsg,
    exchangePromise,
    generateInvoice,
    validateExchangeMessage
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = OneEther = web3.utils.toWei(new BN(1), 'ether')

function generateIdentities(amount) {
    // let identities
    // for(let i = 0; i < amount; i++){
    //     identities.push(wallet.generateAccount())
    // }
    // return identities
    return (amount <= 0) ? [wallet.generateAccount()] : [wallet.generateAccount(), ...generateIdentities(amount - 1)]
}

const identity = wallet.generateAccount()     // Generate identity
const identityHash = identity.address         // identity hash = keccak(publicKey)[:20]
const accountant = wallet.generateAccount()   // Generate accountant operator wallet

contract('Channel Contract Implementation tests', ([txMaker, ...beneficiaries]) => {
    const identities = generateIdentities(5)   // Generates array of identities
    const operator = wallet.generateAccount()  // Generate accountant operator wallet
    let token, accountant, registry
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new()
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 1)

        // Give some ethers for gas for operator
        topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("register and initialize accountant", async () => {
        await registry.registerAccountant(operator.address, 10)
        const accountantId = await registry.getAccountantAddress(operator.address)
        expect(await registry.isActiveAccountant(accountantId)).to.be.true

        // Initialise accountant object
        accountant = await AccountantImplementation.at(accountantId)
    })

    it("register consumer identities", async () => {
        // First four identities are consumer identities
        for (let i = 0; i < 4; i++) {
            await registry.registerIdentity(identities[i].address, accountant.address, 0, beneficiaries[i])
            expect(await registry.isRegistered(identities[i].address)).to.be.true
        }
    })

    it("register provider identity and open incoming channel with accountant", async () => {
        const providerIdentity = identities[4].address
        const expectedChannelId = generateChannelId(providerIdentity, accountant.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(2000)

        // Register identity and open channel with accountant
        await registry.registerIdentity(providerIdentity, accountant.address, channelStake, beneficiaries[4])
        expect(await registry.isRegistered(providerIdentity)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to accountant
        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(channelStake)

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())
    })

    it("topup consumer channels", async () => {
        for (let i = 0; i < 4; i++) {
            const channelId = await registry.getChannelAddress(identities[i].address)
            const amount = new BN(800)
            await token.transfer(channelId, amount)

            const channelTotalBalance = await token.balanceOf(channelId)
            channelTotalBalance.should.be.bignumber.equal(amount)
        }
    })

    it("shoud successfylly pay through accountant", async () => {
        const consumer = identities[0]
        const provider = identities[4]
        const channelId = await registry.getChannelAddress(consumer.address)
        const amount = new BN(10)

        // Provider generates invoice
        const invoice = generateInvoice(amount)

        // Consumer generates payment promise and exchange message
        const exchangeMsg = createExchangeMsg(invoice, provider.address, channelId, consumer)

        // Provider validates exchange message
        validateExchangeMessage(exchangeMsg, consumer.pubKey, provider.address)
        
        // Exchange given message into payment promise from accountant
        const promise = await exchangePromise(exchangeMsg, consumer.pubKey, provider.address, channelId, accountant, operator, token)

        // settle promise on-chain
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, invoice.R, promise.extraDataHash, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })
})


// In this file we'll have a few end-to-end workflows for using our smart contrats

// Green path:
// -> register identity 1 
// -> topup using myst
// -> register identiity 2 
// -> identity 1 sign cheque for identity 2 
// -> identity 1 sign cheque for non identity address
// -> tx maker settle cheques and gets fee
// -> identity 1 topup using ethers
// -> identity 1 sign cheque for identity 2 
// -> tx maker settle cheque and gets fee
// -> identity 2 doing withdrawal

// async function getChannel(identityHash, registry) {
//     return await TestChannelImplementation.at(await genCreate2Address(identityHash, registry))
// }

// it("should fail registering identity without paying registration fee", async () => {
//     await registry.registerIdentity(identityHash).should.be.rejected
// })

// it("should register identity by paying fee", async () => {
//     const userAccount = otherAccounts[0]

//     // Mint 100 tokens into user account
//     const tokensToMint = OneToken.mul(new BN(100))
//     await token.mint(userAccount, tokensToMint)
//     const userTokenBalance = await token.balanceOf(userAccount)
//     userTokenBalance.should.be.bignumber.equal(tokensToMint)

//     // Approve registry to use tokens
//     await token.approve(registry.address, OneToken, {from: userAccount})

//     // Register identity
//     await registry.registerIdentity(identityHash, hub, {from: userAccount})
//     expect(await registry.isRegistered(identityHash)).to.be.true
// })


// it("should be able to topup channel", async () => {
//     const userAccount = otherAccounts[0]
//     const channel = await getChannel(identityHash, registry)
//     const amount = OneToken.mul(new BN(8)) // 8 full tokens
    
//     await token.transfer(channel.address, amount, {from: userAccount})
//     channelTotalBalance = await token.balanceOf(channel.address)
//     channelTotalBalance.should.be.bignumber.equal(amount)
// })



    // TODO add tests for cooperative withdrawal (updateAndWithdraw)
    // it("should imidiately withdraw funds when other party is cooperating", async () => {
    //     const channel = await getChannel(identityHash, registry)

    //     // identity request withdraw
    //     const amount = new BN((OneToken * 0.5).toString())
    //     const { state, signature } = await requestWithdrawal(privKey, amount, 3600, channel)

    //     // hub agrees on withdrawal request
    //     const hubSignature = signWithdrawRequest(hubPrivKey, state)

    //     // anyone (but usually requester) can send tx into blockchain
    //     await channel.updateAndWithdraw(
    //         toBytes32Buffer(state.identityBalance),
    //         toBytes32Buffer(state.hubBalance),
    //         toBytes32Buffer(state.identityWithdraw),
    //         toBytes32Buffer(state.hubWithdraw),
    //         toBytes32Buffer(state.sequence),
    //         toBytes32Buffer(state.deadline),
    //         signature,
    //         hubSignature
    //     )

    //     const identityBalance = await channel.identityBalance()
    //     identityBalance.should.be.bignumber.equal(state.identityBalance)

    //     const hubBalance = await channel.hubBalance()
    //     hubBalance.should.be.bignumber.equal(state.hubBalance)

    //     const sequence = await channel.lastSequence()
    //     sequence.should.be.bignumber.equal(state.sequence)

    //     const channelTotalBalance = await token.balanceOf(channel.address)
    //     channelTotalBalance.should.be.bignumber.equal(state.totalBalance)

    //     const identityTokens = await token.balanceOf(identityHash)
    //     identityTokens.should.be.bignumber.equal(amount)

    //     // Second attempt sending same withdraw request should fail
    //     await channel.updateAndWithdraw(
    //         toBytes32Buffer(state.identityBalance),
    //         toBytes32Buffer(state.hubBalance),
    //         toBytes32Buffer(state.identityWithdraw),
    //         toBytes32Buffer(state.hubWithdraw),
    //         toBytes32Buffer(state.sequence),
    //         toBytes32Buffer(state.deadline),
    //         signature,
    //         hubSignature
    //     ).should.be.rejected
    // })

    // it("should fail to update channel when someone send tokens in the middle of process", async () => {
    //     const userAccount = otherAccounts[1]
    //     const channel = await getChannel(identityHash, registry)
    //     const { state, signature } = await requestPayment(hubPrivKey, 7, channel)
    //     const identitySignature = signPaymentRequest(privKey, state)

    //     // Mint 100 tokens into hub account and send part of them into channel
    //     const tokensToMint = OneToken.mul(new BN(70))
    //     await topUpTokens(token, userAccount, tokensToMint)
    //     await token.transfer(channel.address, OneToken.mul(new BN(25)), {from: userAccount})

    //     // transaction sent into blockchain should fail because of wrong totalChannelBalance
    //     await channel.update(
    //         toBytes32Buffer(state.identityBalance),
    //         toBytes32Buffer(state.hubBalance),
    //         toBytes32Buffer(state.sequence),
    //         identitySignature,
    //         signature
    //     ).should.be.rejected
    // })

    // it("should fail to update channel when someone send tokens in the middle of process", async () => {
    //     const userAccount = otherAccounts[1]
    //     const channel = await getChannel(identityHash, registry)

    //     // rebalance onchain state
    //     await channel.updateIdentityBalance()

    //     // identity request withdraw
    //     const amount = new BN((OneToken * 5).toString())
    //     const { state, signature } = await requestWithdrawal(privKey, amount, 3600, channel)

    //     // hub agrees on withdrawal request
    //     const hubSignature = signWithdrawRequest(hubPrivKey, state)

    //     // deposit some tokens before update transaction
    //     await token.approve(channel.address, amount, {from: userAccount})
    //     await channel.deposit(hub, amount, {from: userAccount})

    //     // transaction sent into blockchain should fail because of wrong totalChannelBalance
    //     await channel.updateAndWithdraw(
    //         toBytes32Buffer(state.identityBalance),
    //         toBytes32Buffer(state.hubBalance),
    //         toBytes32Buffer(state.identityWithdraw),
    //         toBytes32Buffer(state.hubWithdraw),
    //         toBytes32Buffer(state.sequence),
    //         toBytes32Buffer(state.deadline),
    //         signature,
    //         hubSignature
    //     ).should.be.rejected
    // })
    // TODO add tests for exiting channel (a few tests, green path and trying cheating)
    // TODO check for reentrancy in exit finalisation, topup and withdrawal
    // TODO add tests for chalenge period updates
    // TODO test foreign tokens and ethers recovery