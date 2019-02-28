require('chai')
    .use(require('chai-as-promised'))
    .should()

const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")

contract('IdentityRegistry', ([_, minter, ...otherAccounts]) => {
    let token, identityImplementation, registry
    before(async () => {
        token = await MystToken.new()
        identityImplementation = await IdentityImplementation.new()
        registry = await IdentityRegistry.new(token.address, 0, identityImplementation.address)
    })

    it('should have zero registration fee', async () => {
        const registrationFee = await registry.registrationFee()
        expect(Number(registrationFee)).to.be.equal(0)
    })

    it('should register identity having 0 balance', async () => {
        const identityHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

        expect(await registry.isRegistered(identityHash)).to.be.false
        await registry.registerIdentity(identityHash)
        expect(await registry.isRegistered(identityHash)).to.be.true
    })
})
