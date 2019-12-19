require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('openzeppelin-test-helpers')
const { topUpTokens, setupConfig } = require('./utils/index.js')
const { signIdentityRegistration } = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const ChannelImplementationProxy = artifacts.require("ChannelImplementationProxy")

const Zero = new BN(0)
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')

// Generate private keys for accountant operators
const operators = [
    wallet.generateAccount(),
    wallet.generateAccount(),
    wallet.generateAccount()
]

const identity = wallet.generateAccount()

contract('Multi accountants', ([txMaker, ...beneficiaries]) => {
    let token, channelImplementation, accountants, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new()
        channelImplementation = await ChannelImplementationProxy.new()
        const config = await setupConfig(txMaker, channelImplementation.address, accountantImplementation.address)
        registry = await Registry.new(token.address, dex.address, config.address, 0, 0)

        // Topup some tokens into txMaker address so it could register accountants
        await topUpTokens(token, txMaker, 1000)
        await token.approve(registry.address, 1000)
    })

    it('should register accountants', async () => {
        accountants = []
        for (const operator of operators) {
            await registry.registerAccountant(operator.address, 10, 0, OneToken)
            const id = await registry.getAccountantAddress(operator.address)
            accountants.push({ id, operator })
            expect(await registry.isAccountant(id)).to.be.true
        }
    })

    it('should register consumer identity', async () => {
        const accountantId = accountants[0].id
        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(accountantId, Zero, Zero, beneficiaries[0], signature)
        expect(await registry.isRegistered(identity.address)).to.be.true

        const channel = await ChannelImplementation.at(await registry.getChannelAddress(identity.address, accountantId))
        expect((await channel.accountant()).contractAddress).to.be.equal(accountantId)
    })


    it('should register consumer channel with second accountant', async () => {
        const accountantId = accountants[1].id
        expect(await registry.isRegistered(identity.address)).to.be.true

        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(accountantId, Zero, Zero, beneficiaries[0], signature)

        const channel = await ChannelImplementation.at(await registry.getChannelAddress(identity.address, accountantId))
        expect((await channel.accountant()).contractAddress).to.be.equal(accountantId)
    })

    it('should fail registering consumer channel with same accountant twice', async () => {
        const accountantId = accountants[1].id
        expect(await registry.isRegistered(identity.address)).to.be.true

        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(accountantId, Zero, Zero, beneficiaries[0], signature).should.be.rejected
    })
})
