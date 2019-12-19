/*
    In this file we'll have a few end-to-end workflows which emulates all necesary
    on-chain and off-chain interactions from registering identity, to settlement of received funds
*/

const { BN } = require('openzeppelin-test-helpers')
const {
    topUpTokens,
    topUpEthers,
    generateChannelId,
    setupConfig
} = require('./utils/index.js')
const {
    createAccountantService,
    createConsumer,
    createProvider,
    signChannelOpening,
    signIdentityRegistration
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const ChannelImplementationProxy = artifacts.require("ChannelImplementationProxy")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

let token, accountant, registry;
const identities = generateIdentities(5)   // Generates array of identities
const operator = wallet.generateAccount()  // Generate accountant operator wallet

function generateIdentities(amount) {
    return (amount <= 0) ? [wallet.generateAccount()] : [wallet.generateAccount(), ...generateIdentities(amount - 1)]
}

async function pay(consumer, provider, accountantService, amount, repetitions = 1) {
    const agreementId = provider.generateInvoice(new BN(0)).agreementId
    for (let i = 0; i < repetitions; i++) {
        const invoice = provider.generateInvoice(amount, agreementId)
        const exchangeMsg = consumer.createExchangeMsg(invoice, provider.identity.address)
        const promise = await accountantService.exchangePromise(exchangeMsg, consumer.identity.pubKey, provider.identity.address)
        provider.savePromise(promise)
    }
}

contract('Green path tests', ([txMaker, ...beneficiaries]) => {
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new()
        const channelImplementation = await ChannelImplementationProxy.new()
        const config = await setupConfig(txMaker, channelImplementation.address, accountantImplementation.address)
        registry = await Registry.new(token.address, dex.address, config.address, 0, 1)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    // TODO Topup = Register
    // Ask tx-maker to make tx +  sign cheque for him for that. Works even with registration fee stuff.
    it("register and initialize accountant", async () => {
        await registry.registerAccountant(operator.address, 10, 0, OneToken)
        const accountantId = await registry.getAccountantAddress(operator.address)
        expect(await registry.isAccountant(accountantId)).to.be.true

        // Initialise accountant object
        accountant = await AccountantImplementation.at(accountantId)
    })

    it("register consumer identities", async () => {
        // First four identities are consumer identities
        for (let i = 0; i < 4; i++) {
            const signature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaries[i], identities[i])
            await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaries[i], signature)
            expect(await registry.isRegistered(identities[i].address)).to.be.true
        }
    })

    it("register provider identity and open incoming channel with accountant", async () => {
        const providerIdentity = identities[4].address
        const expectedChannelId = generateChannelId(providerIdentity, accountant.address)
        const initialAccountantBalance = await token.balanceOf(accountant.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(2000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(providerIdentity, accountant.address)
        await topUpTokens(token, channelAddress, OneToken)

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[4], identities[4])
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[4], signature)
        expect(await registry.isRegistered(providerIdentity)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to accountant
        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(initialAccountantBalance.add(channelStake))

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())
    })

    it("topup consumer channels", async () => {
        for (let i = 0; i < 4; i++) {
            const channelId = await registry.getChannelAddress(identities[i].address, accountant.address)
            const amount = new BN(10000)
            await token.transfer(channelId, amount)

            const channelTotalBalance = await token.balanceOf(channelId)
            channelTotalBalance.should.be.bignumber.equal(amount)
        }
    })

    it("shoud successfylly pay through accountant", async () => {
        const consumer = await createConsumer(registry, identities[0], accountant.address)
        const provider = await createProvider(identities[4], accountant)
        const accountantService = await createAccountantService(accountant, operator, token)
        const amount = new BN(10)

        // Provider generates invoice
        const invoice = provider.generateInvoice(amount)

        // Consumer generates payment promise and exchange message
        const exchangeMsg = consumer.createExchangeMsg(invoice, provider.identity.address)

        // Provider validates exchange message
        provider.validateExchangeMessage(exchangeMsg, consumer.identity.pubKey)

        // Exchange given message into payment promise from accountant
        const promise = await accountantService.exchangePromise(exchangeMsg, consumer.identity.pubKey, provider.identity.address)

        // settle promise on-chain
        await provider.settlePromise(promise)

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })

    it("should properly aggregate payments for provider", async () => {
        const consumer1 = await createConsumer(registry, identities[0], accountant.address)
        const consumer2 = await createConsumer(registry, identities[1], accountant.address)
        const consumer3 = await createConsumer(registry, identities[2], accountant.address)
        const provider = await createProvider(identities[4], accountant)
        const accountantService = await createAccountantService(accountant, operator, token)

        // Let's do a few payments by different consumers
        await pay(consumer1, provider, accountantService, new BN(77), 3)
        await pay(consumer2, provider, accountantService, new BN(900), 1)
        await pay(consumer3, provider, accountantService, new BN(1), 20)
        await pay(consumer1, provider, accountantService, new BN(10), 1)

        // check aggregated promise amount
        provider.getBiggestPromise().amount.should.be.bignumber.equal('1161')

        // settle biggest promise
        await provider.settleAndRebalance()

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal('1161')

        const channel = await accountant.channels(generateChannelId(provider.identity.address, accountant.address))
        channel.balance.should.be.bignumber.equal(channel.loan)
    })

})
