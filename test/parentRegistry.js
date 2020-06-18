require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')

const generateAccount = require('./utils/wallet.js').generateAccount
const topUpTokens = require('./utils/index.js').topUpTokens
const signIdentityRegistration = require('./utils/client.js').signIdentityRegistration

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const Registry = artifacts.require("Registry")
const ParentRegistry = artifacts.require("TestOldRegistry")

const OneEther = web3.utils.toWei('1', 'ether')
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'

function generateIdentities(amount) {
    return (amount <= 0) ? [generateAccount()] : [generateAccount(), ...generateIdentities(amount - 1)]
}
const identities = generateIdentities(3)   // Generates array of identities

contract('Parent registry', ([txMaker, minter, hermesOperator, hermesOperator2, fundsDestination, ...otherAccounts]) => {
    let token, channelImplementation, hermesImplementation, accId, hermesId, registry, parentRegistry
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        hermesImplementation = await HermesImplementation.new()
        channelImplementation = await ChannelImplementation.new()
        parentRegistry = await ParentRegistry.new(token.address)
        registry = await Registry.new(token.address, dex.address, 0, 0, channelImplementation.address, hermesImplementation.address, parentRegistry.address)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(token, txMaker, 100)
        await token.approve(parentRegistry.address, 10)
        await token.approve(registry.address, 10)
    })

    it('should register hermes into parent registry', async () => {
        await parentRegistry.registerAccountant(hermesOperator)
        accId = await parentRegistry.getAccountantAddress(hermesOperator)
        expect(await parentRegistry.isAccountant(accId)).to.be.true
    })

    it('should register hermes into new registry', async () => {
        await registry.registerHermes(hermesOperator2, 10, 0, 25, OneToken)
        hermesId = await registry.getHermesAddress(hermesOperator2)
        expect(await registry.isHermes(hermesId)).to.be.true
    })

    it('should register identity into parent registry', async () => {
        const identity = identities[0]
        const identityAddress = identity.address
        const signature = signIdentityRegistration(parentRegistry.address, accId, Zero, Zero, fundsDestination, identity)

        expect(await parentRegistry.isRegistered(identityAddress)).to.be.false
        await parentRegistry.registerIdentity(accId, Zero, Zero, fundsDestination, signature)
        expect(await parentRegistry.isRegistered(identityAddress)).to.be.true
    })

    it('should register identity into new registry', async () => {
        const identity = identities[1]
        const identityAddress = identity.address
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, fundsDestination, identity)

        expect(await registry.isRegistered(identityAddress)).to.be.false
        await registry.registerIdentity(hermesId, Zero, Zero, fundsDestination, signature)
        expect(await registry.isRegistered(identityAddress)).to.be.true
    })

    it('should fail registration of already existing identity', async () => {
        const identity = identities[0]
        const identityAddress = identity.address
        const signature = signIdentityRegistration(registry.address, accId, Zero, Zero, fundsDestination, identity)

        expect(await registry.isRegistered(identityAddress)).to.be.true
        await registry.registerIdentity(accId, Zero, Zero, fundsDestination, signature).should.be.rejected
    })

})
