require('chai')
.use(require('chai-as-promised'))
.should()

const genCreate2Address = require('./utils.js').genCreate2Address

const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

const OneEther = web3.utils.toWei('1', 'ether')
const identityHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

contract('Identity registry', ([owner, minter, ...otherAccounts]) => {
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

    it('should register identity having 0 balance', async () => {
        expect(await registry.isRegistered(identityHash)).to.be.false
        await registry.registerIdentity(identityHash)
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it('registry should have proper IdentityContractAddress calculations', async () => {
        expect(
            await genCreate2Address(identityHash, registry)
        ).to.be.equal(
            (await registry.getIdentityContractAddress(identityHash)).toLowerCase()
        )
    })

    it('identity contract should be deployed into predefined address and be EIP1167 proxy', async () => {
        const identityContractAddress = await genCreate2Address(identityHash, registry)
        const byteCode = await web3.eth.getCode(identityContractAddress)

        // We're expecting EIP1167 minimal proxy pointing into identity implementation address
        const expectedByteCode = [
            '0x363d3d373d3d3d363d73',
            identityImplementation.address.slice(2),
            '5af43d82803e903d91602b57fd5bf3'
        ].join('').toLocaleLowerCase()
        
        expect(byteCode).to.be.equal(expectedByteCode)
    })

    it('should revert when ethers are sent to registry', async () => {
        await registry.sendTransaction({
            from: minter,
            value: OneEther,
            gas: 200000
        }).should.be.rejected
    })
})
