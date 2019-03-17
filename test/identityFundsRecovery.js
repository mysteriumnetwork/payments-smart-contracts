const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    generatePrivateKey,
    privateToPublic,
    getIdentityHash,
    signMessage,
    verifySignature,
    setLengthLeft,
    topUpEthers,
    topUpTokens
} = require('./utils')

const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

// Generate identity
const privKey = generatePrivateKey()
const pubKey = privateToPublic(privKey)
const identityHash = getIdentityHash(pubKey)

const OneEther = web3.utils.toWei('1', 'ether')
const ZeroAddress = '0x0000000000000000000000000000000000000000'

function createCheque(privateKey, destination) {
    const PREFIX = Buffer.from("Set funds destination:")
    const message = Buffer.concat([PREFIX, Buffer.from(destination.slice(2), 'hex')])
    const signature = signMessage(message, privateKey)

    // verify the signature
    const publicKey = privateToPublic(privateKey)
    expect(verifySignature(message, signature, publicKey)).to.be.true

    return signature
}

contract('General tests for funds recovery', ([txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, dex, registry, identityContract, expectedAddress, topupAmount
    before (async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        const identityImplementation = await IdentityImplementation.new(token.address, dex.address, owner, OneEther)
        registry = await IdentityRegistry.new(token.address, 0, identityImplementation.address)

        // Topup some tokens and ethers into expected address
        expectedAddress = await genCreate2Address(identityHash, registry)
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], expectedAddress, topupAmount)
        await topUpTokens(token, expectedAddress, topupAmount)
    })

    it('should register identity', async () => {
        // register identity
        await registry.registerIdentity(identityHash).should.be.fulfilled
        expect(await registry.isRegistered(identityHash)).to.be.true
        expect((await registry.getIdentityContractAddress(identityHash)).toLowerCase()).to.be.equal(expectedAddress.toLowerCase())
    })

    it('should fail recovering funds when destination is not set', async () => {
        identityContract = await IdentityImplementation.at(expectedAddress)
        await identityContract.claimEthers().should.be.rejected
        expect(await identityContract.getFundsDestination()).to.be.equal(ZeroAddress)
    })

    it('should fail setting funds destination using standard function', async () => {
        await identityContract.setFundsDestination(fundsDestination).should.be.rejected
        expect(await identityContract.getFundsDestination()).to.be.equal(ZeroAddress)
    })

    it('should set funds destination using checque', async () => {
        const signature = createCheque(privKey, fundsDestination)
        await identityContract.setFundsDestinationByCheque(fundsDestination, signature).should.be.fulfilled
        expect(await identityContract.getFundsDestination()).to.be.equal(fundsDestination)
    })

    it('should fail setting funds destination using wrong identity', async () => {
        const secondPrivKey = generatePrivateKey()
        const signature = createCheque(secondPrivKey, otherAccounts[1])
        await identityContract.setFundsDestinationByCheque(fundsDestination, signature).should.be.rejected
        expect(await identityContract.getFundsDestination()).to.be.equal(fundsDestination)
    })

    it('should recover ethers', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await identityContract.claimEthers({from: otherAccounts[1]}).should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover tokens', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await identityContract.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount;
        (await token.balanceOf(fundsDestination)).should.be.bignumber.equal(expectedBalance.toString())
    })
})
