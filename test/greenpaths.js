/*
    In this file we'll have a few end-to-end workflows which emulates all necesary
    on-chain and off-chain interactions from registering identity, to settlement of received funds
*/

const { BN } = require('@openzeppelin/test-helpers')
const {
    topUpTokens,
    topUpEthers,
    setupDEX,
    generateChannelId
} = require('./utils/index.js')
const {
    createHermesService,
    createConsumer,
    createProvider,
    signIdentityRegistration
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')
const { expect } = require('chai')

const MystToken = artifacts.require("TestMystToken")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("TestHermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const hermesURL = Buffer.from('http://test.hermes')
const hermes2URL = Buffer.from('https://test.hermes2')

let token, hermes, registry;
const identities = generateIdentities(6)   // Generates array of identities
const operator = wallet.generateAccount()  // Generate hermes operator wallet
const operator2 = wallet.generateAccount() // Generate operator for second hermes

function generateIdentities(amount) {
    return (amount <= 0) ? [wallet.generateAccount()] : [wallet.generateAccount(), ...generateIdentities(amount - 1)]
}

async function pay(consumer, provider, hermesService, amount, repetitions = 1) {
    const agreementId = provider.generateInvoice(new BN(0)).agreementId
    for (let i = 0; i < repetitions; i++) {
        const invoice = provider.generateInvoice(amount, agreementId)
        const exchangeMsg = consumer.createExchangeMsg(invoice, provider.identity.address)
        const promise = await hermesService.exchangePromise(exchangeMsg, consumer.identity.pubKey, provider.identity.address)
        provider.savePromise(promise)
    }
}

contract('Green path tests', ([txMaker, ...beneficiaries]) => {
    before(async () => {
        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new()
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, 1, channelImplementation.address, hermesImplementation.address)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    // TODO Topup = Register
    // Ask tx-maker to make tx +  sign cheque for him for that. Works even with registration fee stuff.
    it("register and initialize hermes", async () => {
        await registry.registerHermes(operator.address, 10, 0, 25, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(operator.address)
        expect(await registry.isHermes(hermesId)).to.be.true

        // Initialise hermes object
        hermes = await HermesImplementation.at(hermesId)
    })

    it("register consumer identities", async () => {
        // First four identities are consumer identities
        for (let i = 0; i < 4; i++) {
            const signature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaries[i], identities[i])
            await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaries[i], signature)
            expect(await registry.isRegistered(identities[i].address)).to.be.true
        }
    })

    it("register provider identity and open incoming channel with hermes", async () => {
        const providerIdentity = identities[4].address
        const expectedChannelId = generateChannelId(providerIdentity, hermes.address)
        const initialHermesBalance = await token.balanceOf(hermes.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(2000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(providerIdentity, hermes.address)
        await topUpTokens(token, channelAddress, OneToken)

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, channelStake, Zero, beneficiaries[4], identities[4])
        await registry.registerIdentity(hermes.address, channelStake, Zero, beneficiaries[4], signature)
        expect(await registry.isRegistered(providerIdentity)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to hermes
        const hermesTokenBalance = await token.balanceOf(hermes.address)
        hermesTokenBalance.should.be.bignumber.equal(initialHermesBalance.add(channelStake))

        const channel = await hermes.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())
    })

    it("register provider identity and transfer fee to transactor", async () => {
        const providerIdentity = identities[5].address
        const expectedChannelId = generateChannelId(providerIdentity, hermes.address)
        const initialHermesBalance = await token.balanceOf(hermes.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(2000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(providerIdentity, hermes.address)
        await topUpTokens(token, channelAddress, OneToken)

        // Save current token balance
        const txMakerTokenBalance = await token.balanceOf(txMaker)
        const fee = new BN(100)

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, channelStake, fee, beneficiaries[5], identities[5])
        await registry.registerIdentity(hermes.address, channelStake, fee, beneficiaries[5], signature)
        expect(await registry.isRegistered(providerIdentity)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to hermes
        const hermesTokenBalance = await token.balanceOf(hermes.address)
        hermesTokenBalance.should.be.bignumber.equal(initialHermesBalance.add(channelStake))

        const channel = await hermes.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())

        const newTxMakerTokenBalance = await token.balanceOf(txMaker)
        expect(newTxMakerTokenBalance.toNumber()).to.be.equal(txMakerTokenBalance.toNumber() + fee.toNumber())
    })

    it("topup consumer channels", async () => {
        for (let i = 0; i < 4; i++) {
            const channelId = await registry.getChannelAddress(identities[i].address, hermes.address)
            const amount = new BN(10000)
            await token.transfer(channelId, amount)

            const channelTotalBalance = await token.balanceOf(channelId)
            channelTotalBalance.should.be.bignumber.equal(amount)
        }
    })

    it("shoud successfylly pay through hermes", async () => {
        const consumer = await createConsumer(registry, identities[0], hermes.address)
        const provider = await createProvider(identities[4], hermes)
        const hermesService = await createHermesService(hermes, operator, token)
        const amount = new BN(10)

        // Provider generates invoice
        const invoice = provider.generateInvoice(amount)

        // Consumer generates payment promise and exchange message
        const exchangeMsg = consumer.createExchangeMsg(invoice, provider.identity.address)

        // Provider validates exchange message
        provider.validateExchangeMessage(exchangeMsg, consumer.identity.pubKey)

        // Exchange given message into payment promise from hermes
        const promise = await hermesService.exchangePromise(exchangeMsg, consumer.identity.pubKey, provider.identity.address)

        // settle promise on-chain
        await provider.settlePromise(promise)

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })

    it("should properly aggregate payments for provider", async () => {
        const consumer1 = await createConsumer(registry, identities[0], hermes.address)
        const consumer2 = await createConsumer(registry, identities[1], hermes.address)
        const consumer3 = await createConsumer(registry, identities[2], hermes.address)
        const provider = await createProvider(identities[4], hermes)
        const hermesService = await createHermesService(hermes, operator, token)

        // Let's do a few payments by different consumers
        await pay(consumer1, provider, hermesService, new BN(77), 3)
        await pay(consumer2, provider, hermesService, new BN(900), 1)
        await pay(consumer3, provider, hermesService, new BN(1), 20)
        await pay(consumer1, provider, hermesService, new BN(10), 1)

        // check aggregated promise amount
        provider.getBiggestPromise().amount.should.be.bignumber.equal('1161')

        // settle biggest promise
        await provider.settleAndRebalance()

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal('1161')

        const channel = await hermes.channels(generateChannelId(provider.identity.address, hermes.address))
        channel.balance.should.be.bignumber.equal(channel.stake)
    })

    it('should register second hermes', async () => {
        await registry.registerHermes(operator2.address, 10, 0, 50, OneToken, hermes2URL)
        const hermesId = await registry.getHermesAddress(operator2.address)
        expect(await registry.isHermes(hermesId)).to.be.true

        // Initialise hermes object
        hermes2 = await HermesImplementation.at(hermesId)

        // Topup some tokens into hermes2
        await topUpTokens(token, hermes2.address, OneToken)
    })

    it("should allow for any registered identity to settle promise even when there is zero stake in hermes2", async () => {
        const hermesService = await createHermesService(hermes2, operator2, token)
        const provider = await createProvider(identities[1], hermes2)
        const amountToPay = new BN('25')

        // Register and topup consumer channel
        const signature = signIdentityRegistration(registry.address, hermes2.address, Zero, Zero, beneficiaries[0], identities[0])
        await registry.registerIdentity(hermes2.address, Zero, Zero, beneficiaries[0], signature)
        expect(await registry.isRegistered(identities[0].address)).to.be.true
        const consumer = await createConsumer(registry, identities[0], hermes2.address)
        const channelChannelId = await registry.getChannelAddress(identities[0].address, hermes2.address)
        await token.transfer(channelChannelId, amountToPay) // Topup consumer channel

        // Provider generates invoice
        const invoice = provider.generateInvoice(amountToPay)

        // Consumer generates payment promise and exchange message
        const exchangeMsg = consumer.createExchangeMsg(invoice, provider.identity.address)

        // Provider validates exchange message
        provider.validateExchangeMessage(exchangeMsg, consumer.identity.pubKey)


        // Exchange given message into payment promise from hermes
        const promise = await hermesService.exchangePromise(exchangeMsg, consumer.identity.pubKey, provider.identity.address)

        // settle promise on-chain
        await provider.settleAndRebalance(promise)

        const providerBeneficiary = await registry.getChannelAddress(identities[1].address, hermes2.address) // With fast channel opening beneficiary is topup channel address
        const beneficiaryBalance = await token.balanceOf(providerBeneficiary)
        const amountToSettle = amountToPay.sub(amountToPay.div(new BN(10))) // amountToPay - 10% which will be used as stake
        beneficiaryBalance.should.be.bignumber.equal(amountToSettle)
    })

})
