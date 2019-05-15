require('chai')
.use(require('chai-as-promised'))
.should()

const genCreate2Address = require('./utils/index.js').genCreate2Address
const topUpTokens = require('./utils/index.js').topUpTokens

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

const OneEther = OneToken = web3.utils.toWei('1', 'ether')
const identityHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

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
        expect(await registry.isRegistered(identityHash)).to.be.false
        await registry.registerIdentity(identityHash, accountantId, 0, fundsDestination)
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it('registry should have proper channel address calculations', async () => {
        expect(
            await genCreate2Address(identityHash, registry, channelImplementation.address)
        ).to.be.equal(
            (await registry.getChannelAddress(identityHash)).toLowerCase()
        )
    })

    it('identity contract should be deployed into predefined address and be EIP1167 proxy', async () => {
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
})
