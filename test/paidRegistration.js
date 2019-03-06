require('chai')
    .use(require('chai-as-promised'))
    .should()

const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

const OneEther = web3.utils.toWei('1', 'ether')
const identityHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

contract('Paid identity registry', ([owner, ...otherAccounts]) => {
    let token, identityImplementation, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        identityImplementation = await IdentityImplementation.new(token.address, dex.address, owner, OneEther)
        registry = await IdentityRegistry.new(token.address, 0, identityImplementation.address)
    })

    it('should have zero registration fee', async () => {
        const registrationFee = await registry.registrationFee()
        expect(Number(registrationFee)).to.be.equal(0)
    })

    it('should allow to change fee', async () => {
        const newFee = 100
        await registry.changeRegistrationFee(newFee)
        const registrationFee = await registry.registrationFee()
        expect(Number(registrationFee)).to.be.equal(newFee)
    })

    it('should fail registering identity having 0 balance', async () => {
        const userAccount = otherAccounts[0]
        expect(Number(await token.balanceOf(userAccount))).to.be.equal(0)

        await registry.registerIdentity(identityHash, {from: userAccount}).should.be.rejected
        expect(await registry.isRegistered(identityHash)).to.be.false
    })

    it('should register identity which has coins', async () => {
        const userAccount = otherAccounts[0]
        const registratinoFee = 100

        // Mint tokens into account
        const tokensToMint = 1000000
        await token.mint(userAccount, tokensToMint)
        expect(Number(await token.balanceOf(userAccount))).to.be.equal(tokensToMint)

        // Approve registry to use tokens
        await token.approve(registry.address, registratinoFee, {from: userAccount})

        // Register account
        await registry.registerIdentity(identityHash, {from: userAccount})
        expect(await registry.isRegistered(identityHash)).to.be.true
        
        // Registry should own some tokens
        expect(Number(await token.balanceOf(registry.address))).to.be.equal(registratinoFee)
    })
})
