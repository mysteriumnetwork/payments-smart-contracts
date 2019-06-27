require('chai')
.use(require('chai-as-promised'))
.should()
const { BN } = require('openzeppelin-test-helpers')

const genCreate2Address = require('./utils/index.js').genCreate2Address
const topUpTokens = require('./utils/index.js').topUpTokens
const signIdentityRegistration = require('./utils/client.js').signIdentityRegistration
const generateAccount = require('./utils/wallet.js').generateAccount

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

const OneEther = OneToken = web3.utils.toWei('1', 'ether')
const Zero = new BN(0)

function generateIdentities(amount) {
    return (amount <= 0) ? [generateAccount()] : [generateAccount(), ...generateIdentities(amount - 1)]
}

const identities = generateIdentities(3)   // Generates array of identities

contract('Registry', ([txMaker, minter, accountantOperator, fundsDestination, ...otherAccounts]) => {
    let token, channelImplementation, accountantId, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new()
        channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 0)

        // Topup some tokens into txMaker address so it could register accountant
        await topUpTokens(token, txMaker, 10)
        await token.approve(registry.address, 10)
    })

    it('should have zero registration fee', async () => {
        const registrationFee = await registry.registrationFee()
        expect(Number(registrationFee)).to.be.equal(0)
    })

    it('should register accountant', async () => {
        await registry.registerAccountant(accountantOperator, 10)
        accountantId = await registry.getAccountantAddress(accountantOperator)
        expect(await registry.isActiveAccountant(accountantId)).to.be.true
    })

    it('should register identity having 0 balance', async () => {
        const identity = identities[0]
        const identityHash = identity.address
        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, fundsDestination, identity)

        expect(await registry.isRegistered(identityHash)).to.be.false
        await registry.registerIdentity(accountantId, Zero, Zero, fundsDestination, signature)
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it('registry should have proper channel address calculations', async () => {
        const identityHash = identities[0].address
        expect(
            await genCreate2Address(identityHash, registry, channelImplementation.address)
        ).to.be.equal(
            (await registry.getChannelAddress(identityHash)).toLowerCase()
        )
    })

    it('identity contract should be deployed into predefined address and be EIP1167 proxy', async () => {
        const identityHash = identities[0].address
        const channelAddress = await genCreate2Address(identityHash, registry, channelImplementation.address)
        const byteCode = await web3.eth.getCode(channelAddress)

        // We're expecting EIP1167 minimal proxy pointing into identity implementation address
        const expectedByteCode = [
            '0x363d3d373d3d3d363d73',
            channelImplementation.address.slice(2),
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

    // ==================== Paid registration ======================

    it('should allow to change fee', async () => {
        const newFee = 100
        await registry.changeRegistrationFee(newFee)
        const registrationFee = await registry.registrationFee()
        expect(Number(registrationFee)).to.be.equal(newFee)
    })

    it('should fail registering identity having 0 balance', async () => {
        const secondIdentity = identities[1]
        const secondIdentityHash = secondIdentity.address
        const channelAddress = await genCreate2Address(secondIdentityHash, registry, channelImplementation.address)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(0)

        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, fundsDestination, secondIdentity)
        await registry.registerIdentity(accountantId, Zero, Zero, fundsDestination, signature).should.be.rejected
        expect(await registry.isRegistered(secondIdentityHash)).to.be.false
    })

    it('should register identity which has coins', async () => {
        const secondIdentity = identities[1]
        const secondIdentityHash = secondIdentity.address
        const channelAddress = await genCreate2Address(secondIdentityHash, registry, channelImplementation.address)
        const registratinoFee = 100
        const balanceBefore = Number(await token.balanceOf(registry.address))

        // TopUp channel -> send or mint tokens into channel address
        const topUpAmount = 1000000
        await token.mint(channelAddress, topUpAmount)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(topUpAmount)

        // Register identity
        const signature = signIdentityRegistration(registry.address, accountantId, Zero, Zero, fundsDestination, secondIdentity)
        await registry.registerIdentity(accountantId, Zero, Zero, fundsDestination, signature)
        expect(await registry.isRegistered(secondIdentityHash)).to.be.true

        // Registry should own some tokens
        expect(Number(await token.balanceOf(registry.address))).to.be.equal(balanceBefore + registratinoFee)
    })

    it("should send transaction fee for txMaker", async () => {
        const thirdIdentity = identities[2]
        const thirdIdentityHash = thirdIdentity.address 
        const channelAddress = await genCreate2Address(thirdIdentityHash, registry, channelImplementation.address)
        const transactionFee = new BN(5)
        const balanceBefore = await token.balanceOf(txMaker)

        // TopUp channel -> send or mint tokens into channel address
        const topUpAmount = 1000000
        await token.mint(channelAddress, topUpAmount)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(topUpAmount)

        // Register identity
        const signature = signIdentityRegistration(registry.address, accountantId, Zero, transactionFee, fundsDestination, thirdIdentity)
        await registry.registerIdentity(accountantId, Zero, transactionFee, fundsDestination, signature)
        expect(await registry.isRegistered(thirdIdentityHash)).to.be.true

        // txMaker should own some tokens
        expect(Number(await token.balanceOf(txMaker))).to.be.equal(balanceBefore.add(transactionFee).toNumber())
    })
})
