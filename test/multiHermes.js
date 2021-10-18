require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('web3-utils')
const { topUpTokens, setupDEX } = require('./utils/index.js')
const { signIdentityRegistration } = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("TestMystToken")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("HermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const ZeroAddress = '0x0000000000000000000000000000000000000000'
const Zero = new BN(0)
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const hermesURL = Buffer.from('http://test.hermes')

// Generate private keys for hermes operators
const operators = [
    wallet.generateAccount(),
    wallet.generateAccount(),
    wallet.generateAccount()
]

const identity = wallet.generateAccount()

contract('Multi hermeses', ([txMaker, ...beneficiaries]) => {
    let token, channelImplementation, hermeses, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new()
        channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, 0, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Topup some tokens into txMaker address so it could register hermeses
        await topUpTokens(token, txMaker, 1000)
        await token.approve(registry.address, 1000)
    })

    it('should register hermeses', async () => {
        hermeses = []
        for (const operator of operators) {
            await registry.registerHermes(operator.address, 10, 0, OneToken, hermesURL)
            const id = await registry.getHermesAddress(operator.address)
            hermeses.push({ id, operator })
            expect(await registry.isHermes(id)).to.be.true
        }
    })

    it('should register consumer identity', async () => {
        const hermesId = hermeses[0].id
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(hermesId, Zero, Zero, beneficiaries[0], signature)
        expect(await registry.isRegistered(identity.address)).to.be.true

        const channel = await ChannelImplementation.at(await registry.getChannelAddress(identity.address, hermesId))
        expect((await channel.hermes()).contractAddress).to.be.equal(hermesId)
    })


    it('should register consumer channel with second hermes', async () => {
        const hermesId = hermeses[1].id
        expect(await registry.isRegistered(identity.address)).to.be.true

        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(hermesId, Zero, Zero, beneficiaries[0], signature)

        const channel = await ChannelImplementation.at(await registry.getChannelAddress(identity.address, hermesId))
        expect((await channel.hermes()).contractAddress).to.be.equal(hermesId)
    })

    it('should fail registering consumer channel with same hermes twice', async () => {
        const hermesId = hermeses[1].id
        expect(await registry.isRegistered(identity.address)).to.be.true

        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, beneficiaries[0], identity)
        await registry.registerIdentity(hermesId, Zero, Zero, beneficiaries[0], signature).should.be.rejected
    })
})
