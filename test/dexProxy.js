const { BN } = require('openzeppelin-test-helpers');

const MystToken = artifacts.require("MystToken")
const DEXProxy = artifacts.require("DEXProxy")
const ProxyTarget = artifacts.require("ProxyTarget")
const SecondProxyTarget = artifacts.require("SecondProxyTarget")

const OneEther = web3.utils.toWei(new BN(1), 'ether')

contract('DEX Proxy', ([_, owner, ...otherAccounts]) => {
    let token, dex, proxy, proxiedImplementation
    before (async () => {
        token = await MystToken.new()
        implementation = await ProxyTarget.new()
        proxy = await DEXProxy.new(implementation.address, owner)
        proxiedImplementation = await ProxyTarget.at(proxy.address)
    })

    it('should always work', () => {})

    it('should have proper proxy owner', async () => {
        const proxyOwner = await proxy.___proxyOwner()
        expect(proxyOwner).to.be.equal(owner)
    })

    it('should correctly transfer ownership', async () => {
        await proxy.___setProxyOwner(otherAccounts[0], {from: owner})
        const newOwner = await proxy.___proxyOwner()
        expect(newOwner).to.be.equal(otherAccounts[0])
    })

    it('should fail when not owner is setting new owner', async () => {
        await proxy.___setProxyOwner(otherAccounts[1]).should.be.rejected
    })

    it('should have proper implementation', async () => {
        const expectedName = await proxiedImplementation.name()
        expect(expectedName).to.be.equal('FirstTarget')

        const expectedTargetAddress = await proxy.___Implementation()
        expect(expectedTargetAddress).to.be.equal(implementation.address)
    })

    it('should set new implementation', async () => {
        const newImplementation = await SecondProxyTarget.new()
        await proxy.___upgradeTo(newImplementation.address, {from: otherAccounts[0]})
        
        const expectedName = await proxiedImplementation.name()
        expect(expectedName).to.be.equal('SecondTarget')
    })

    it('should fail when not owner is setting new implementation', async () => {
        await proxy.___upgradeTo(implementation.address).should.be.rejected
        
        const expectedName = await proxiedImplementation.name()
        expect(expectedName).to.be.equal('SecondTarget')
    })

    it('should change target back to original', async () => {
        await proxy.___upgradeTo(implementation.address, {from: otherAccounts[0]})

        const expectedName = await proxiedImplementation.name()
        expect(expectedName).to.be.equal('FirstTarget')
    })

    it('should have own storage with different than `implementation` state', async () => {
        // Implementation contract is already initialised
        expect(await implementation.initialised()).to.be.true

        // Proxy is pointing to same implementation should be not initialised
        const expectedTargetAddress = await proxy.___Implementation()
        expect(expectedTargetAddress).to.be.equal(implementation.address)
        expect(proxiedImplementation.address).to.be.equal(proxy.address)
        expect(await proxiedImplementation.initialised()).to.be.false

        // Calling `initialise` function on Implementation address should fail
        await implementation.initialise().should.be.rejected

        // Calling `initialise` function on proxied implementation should change it's state
        await proxiedImplementation.initialise()
        expect(await proxiedImplementation.initialised()).to.be.true
    })
})
