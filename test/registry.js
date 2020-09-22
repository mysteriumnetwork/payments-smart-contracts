require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')

const genCreate2Address = require('./utils/index.js').genCreate2Address
const topUpTokens = require('./utils/index.js').topUpTokens
const setupDEX = require('./utils/index.js').setupDEX
const { signIdentityRegistration, signUrlUpdate } = require('./utils/client.js')
const generateAccount = require('./utils/wallet.js').generateAccount

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const MystToken = artifacts.require("TestMystToken")

const OneEther = web3.utils.toWei('1', 'ether')
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'

function generateIdentities(amount) {
    return (amount <= 0) ? [generateAccount()] : [generateAccount(), ...generateIdentities(amount - 1)]
}

const identities = generateIdentities(3)   // Generates array of identities
const operator = generateAccount()
const hermesOperator = operator.address

contract('Registry', ([txMaker, minter, fundsDestination, ...otherAccounts]) => {
    let token, channelImplementation, hermesImplementation, hermesId, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await setupDEX(token, txMaker)
        hermesImplementation = await HermesImplementation.new()
        channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, 0, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(token, txMaker, 10)
        await token.approve(registry.address, 10)
    })

    it('should register hermes', async () => {
        const hermesURL = Buffer.from('http://test.hermes')
        await registry.registerHermes(hermesOperator, 10, 0, 25, OneToken, hermesURL)
        hermesId = await registry.getHermesAddress(hermesOperator)
        expect(await registry.isHermes(hermesId)).to.be.true
    })

    it('hermes should have proper URL', async () => {
        const expectedURL = 'http://test.hermes'
        expect(Buffer.from((await registry.getHermesURL(hermesId)).slice(2), 'hex').toString()).to.be.equal(expectedURL)
    })

    it('should be possible to change hermes URL', async () => {
        const newURL = 'https://test.hermes/api/v2'
        const signature = signUrlUpdate(registry.address, hermesId, newURL, operator)
        await registry.updateHermsURL(hermesId, Buffer.from(newURL), signature)

        expect(Buffer.from((await registry.getHermesURL(hermesId)).slice(2), 'hex').toString()).to.be.equal(newURL)
    })

    it('should register identity having 0 balance', async () => {
        const identity = identities[0]
        const identityHash = identity.address
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, fundsDestination, identity)

        expect(await registry.isRegistered(identityHash)).to.be.false
        await registry.registerIdentity(hermesId, Zero, Zero, fundsDestination, signature)
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it('should reject second attempt to create same channel', async () => {
        const identity = identities[0]
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, fundsDestination, identity)
        await registry.registerIdentity(hermesId, Zero, Zero, fundsDestination, signature).should.be.rejected
    })

    it('should reject registration with different beneficiary for already registered identity', async () => {
        const identity = identities[0]
        const beneficiary = otherAccounts[0]

        expect(await registry.isRegistered(identity.address)).to.be.true

        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, beneficiary, identity)
        await registry.registerIdentity(hermesId, Zero, Zero, beneficiary, signature).should.be.rejected
    })

    it('registry should have proper channel address calculations', async () => {
        const identityHash = identities[0].address
        expect(
            await genCreate2Address(identityHash, hermesId, registry, channelImplementation.address)
        ).to.be.equal(
            (await registry.getChannelAddress(identityHash, hermesId)).toLowerCase()
        )
    })

    it('identity contract should be deployed into predefined address and be EIP1167 proxy', async () => {
        const identityHash = identities[0].address
        const channelAddress = await genCreate2Address(identityHash, hermesId, registry, channelImplementation.address)
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

    it('should fail registering identity having 0 balance', async () => {
        const txFee = 1
        const secondIdentity = identities[1]
        const secondIdentityHash = secondIdentity.address
        const channelAddress = await genCreate2Address(secondIdentityHash, hermesId, registry, channelImplementation.address)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(0)

        const signature = signIdentityRegistration(registry.address, hermesId, Zero, txFee, fundsDestination, secondIdentity)
        await registry.registerIdentity(hermesId, Zero, txFee, fundsDestination, signature).should.be.rejected
        expect(await registry.isRegistered(secondIdentityHash)).to.be.false
    })

    it('should register identity which has coins', async () => {
        const txFee = 100
        const secondIdentity = identities[1]
        const secondIdentityHash = secondIdentity.address
        const channelAddress = await genCreate2Address(secondIdentityHash, hermesId, registry, channelImplementation.address)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(0)

        // TopUp channel -> send or mint tokens into channel address
        const topUpAmount = 1000000
        await token.mint(channelAddress, topUpAmount)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(topUpAmount)

        // Register identity
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, txFee, fundsDestination, secondIdentity)
        await registry.registerIdentity(hermesId, Zero, txFee, fundsDestination, signature)
        expect(await registry.isRegistered(secondIdentityHash)).to.be.true
    })

    it("should send transaction fee for txMaker", async () => {
        const thirdIdentity = identities[2]
        const thirdIdentityHash = thirdIdentity.address
        const channelAddress = await genCreate2Address(thirdIdentityHash, hermesId, registry, channelImplementation.address)
        const transactionFee = new BN(5)
        const balanceBefore = await token.balanceOf(txMaker)

        // TopUp channel -> send or mint tokens into channel address
        const topUpAmount = 1000000
        await token.mint(channelAddress, topUpAmount)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(topUpAmount)

        // Register identity
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, transactionFee, fundsDestination, thirdIdentity)
        await registry.registerIdentity(hermesId, Zero, transactionFee, fundsDestination, signature)
        expect(await registry.isRegistered(thirdIdentityHash)).to.be.true

        // txMaker should own some tokens
        expect(Number(await token.balanceOf(txMaker))).to.be.equal(balanceBefore.add(transactionFee).toNumber())
    })
})
