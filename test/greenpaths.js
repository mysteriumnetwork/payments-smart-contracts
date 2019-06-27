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
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

let token, accountant, registry;
const identities = generateIdentities(5)   // Generates array of identities
const operator = wallet.generateAccount()  // Generate accountant operator wallet

function generateIdentities(amount) {
    return (amount <= 0) ? [wallet.generateAccount()] : [wallet.generateAccount(), ...generateIdentities(amount - 1)]
}

async function pay(consumer, provider, accountantService, amount, repetitions = 1) {
    const agreementId = provider.generateInvoice(new BN(0)).agreementId
    for (let i=0; i < repetitions; i++) {
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
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 1)

        // Give some ethers for gas for operator
        topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    // TODO Topup = Register
    // Ask tx-maker to make tx +  sign cheque for him for that. Works even with registration fee stuff.
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
            const signature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaries[i], identities[i])
            await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaries[i], signature)
            expect(await registry.isRegistered(identities[i].address)).to.be.true
        }
    })

    it("register provider identity and open incoming channel with accountant", async () => {
        const providerIdentity = identities[4].address
        const expectedChannelId = generateChannelId(providerIdentity, accountant.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(2000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(providerIdentity)
        await topUpTokens(token, channelAddress, OneToken)

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[4], identities[4])
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[4], signature)
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
            const amount = new BN(10000)
            await token.transfer(channelId, amount)

            const channelTotalBalance = await token.balanceOf(channelId)
            channelTotalBalance.should.be.bignumber.equal(amount)
        }
    })

    it("shoud successfylly pay through accountant", async () => {
        const consumer = await createConsumer(identities[0], registry)
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
        const consumer1 = await createConsumer(identities[0], registry)
        const consumer2 = await createConsumer(identities[1], registry)
        const consumer3 = await createConsumer(identities[2], registry)
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
        await provider.settlePromise()

        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal('1161')
    })

    it("should be possible for consumer to become provider", async () => {
        const consumer = identities[3]
        const beneficiary = beneficiaries[3]
        const expectedChannelId = generateChannelId(consumer.address, accountant.address)

        // Consumer should not have invoming channel with accountant
        expect(await accountant.isOpened(expectedChannelId)).to.be.false

        // Open incoming channel
        const stakeSize = new BN(1000)
        await token.approve(accountant.address, stakeSize)
        const signature = signChannelOpening(accountant.address, consumer, beneficiary, stakeSize)
        await accountant.openChannel(consumer.address, beneficiary, stakeSize, signature)
        expect(await accountant.isOpened(expectedChannelId)).to.be.true
    })

    it("second provider should be able to accept payments", async () => {
        // Accept payments
        const consumer = await createConsumer(identities[2], registry)
        const provider = await createProvider(identities[3], accountant)
        const accountantService = await createAccountantService(accountant, operator, token)
        const beneficiary = beneficiaries[3]

        await pay(consumer, provider, accountantService, new BN(900), 1)
        await provider.settlePromise()
        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal('900')
    })
})
