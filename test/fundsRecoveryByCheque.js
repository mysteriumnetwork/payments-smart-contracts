const { BN } = require('@openzeppelin/test-helpers')
const {
    genCreate2Address,
    signMessage,
    verifySignature,
    topUpEthers,
    topUpTokens,
    toBytes32Buffer,
    setupConfig
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const signIdentityRegistration = require('./utils/client.js').signIdentityRegistration

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const Token = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

const OneEther = web3.utils.toWei('1', 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'

function createCheque(signer, destination, nonce) {
    const PREFIX = Buffer.from("Set funds destination:")
    const message = Buffer.concat([
        PREFIX,
        Buffer.from(destination.slice(2), 'hex'),
        toBytes32Buffer(nonce)
    ])
    const signature = signMessage(message, signer.privKey)

    // verify the signature
    expect(verifySignature(message, signature, signer.pubKey)).to.be.true

    return signature
}

contract('Full path (in channel using cheque) test for funds recovery', ([txMaker, owner, fundsDestination, ...otherAccounts]) => {
    const identity = wallet.generateAccount()     // Generate identity
    const identityHash = identity.address         // identity hash = keccak(publicKey)[:20]
    const hermes = wallet.generateAccount()   // Generate hub operator keys
    const hermesOperator = hermes.address
    let token, registry, channel, hermesId, expectedAddress, topupAmount, tokensToMint
    before(async () => {
        token = await Token.new()
        nativeToken = await Token.new()
        const dex = await MystDex.new()
        const channelImplementation = await ChannelImplementation.new()
        const hermesImplementation = await HermesImplementation.new()
        registry = await Registry.new(nativeToken.address, dex.address, 0, 0, channelImplementation.address, hermesImplementation.address)

        hermesId = await registry.getHermesAddress(hermesOperator)
        expectedAddress = await genCreate2Address(identityHash, hermesId, registry, channelImplementation.address)

        // Topup some tokens and ethers into expected address
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], expectedAddress, topupAmount)
        await topUpTokens(token, expectedAddress, tokensToMint)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(nativeToken, txMaker, 10)
        await nativeToken.approve(registry.address, 10)
    })

    it('should register hermes', async () => {
        await registry.registerHermes(hermesOperator, 10, 0, OneEther)
        expect(await registry.isHermes(hermesId)).to.be.true
    })

    it('should register identity', async () => {
        const signature = signIdentityRegistration(registry.address, hermesId, Zero, Zero, fundsDestination, identity)
        await registry.registerIdentity(hermesId, Zero, Zero, fundsDestination, signature).should.be.fulfilled
        hermesId = await registry.getHermesAddress(hermesOperator)
        expect(await registry.isRegistered(identityHash)).to.be.true
        expect((await registry.getChannelAddress(identityHash, hermesId)).toLowerCase()).to.be.equal(expectedAddress.toLowerCase())
    })

    it('should fail recovering funds when destination is not set', async () => {
        channel = await ChannelImplementation.at(expectedAddress)
        await channel.claimEthers().should.be.rejected
        expect(await channel.getFundsDestination()).to.be.equal(ZeroAddress)
    })

    it('should fail setting funds destination using standard function', async () => {
        await channel.setFundsDestination(fundsDestination).should.be.rejected
        expect(await channel.getFundsDestination()).to.be.equal(ZeroAddress)
    })

    it('should set funds destination using checque', async () => {
        const nonce = new BN(1)
        const signature = createCheque(identity, fundsDestination, nonce)
        await channel.setFundsDestinationByCheque(fundsDestination, nonce, signature).should.be.fulfilled
        expect(await channel.getFundsDestination()).to.be.equal(fundsDestination)
    })

    it('should fail setting funds destination using wrong identity', async () => {
        const secondIdentity = wallet.generateAccount()
        const nonce = new BN(2)
        const signature = createCheque(secondIdentity, otherAccounts[1], nonce)
        await channel.setFundsDestinationByCheque(fundsDestination, nonce, signature).should.be.rejected
        expect(await channel.getFundsDestination()).to.be.equal(fundsDestination)
    })

    it('should recover ethers', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await channel.claimEthers({ from: otherAccounts[1] }).should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover tokens', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await channel.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount;
        (await token.balanceOf(fundsDestination)).should.be.bignumber.equal(expectedBalance.toString())
    })
})
