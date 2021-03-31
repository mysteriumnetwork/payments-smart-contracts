const { BN } = require('@openzeppelin/test-helpers')
const {
    deriveContractAddress,
    topUpEthers,
    topUpTokens,
    setupDEX
} = require('./utils/index.js')

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("TestChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const TestHermesImplementation = artifacts.require("TestHermesImplementation")
const Token = artifacts.require("TestMystToken")
const FundsRecovery = artifacts.require("TestFundsRecovery")

const OneEther = web3.utils.toWei(new BN(1), 'ether')
const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'

async function getExpectedSmartContractAddress(deployer) {
    const nonce = await web3.eth.getTransactionCount(deployer)
    return deriveContractAddress(deployer, nonce)
}

contract('General tests for funds recovery', ([txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, contract, expectedAddress, topupAmount
    before(async () => {
        token = await Token.new()
        nativeToken = await Token.new() // This special token which usually shoudn't be recoverable

        // Toup some tokens and ethers into expected address
        expectedAddress = await getExpectedSmartContractAddress(owner)
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], expectedAddress, topupAmount)
        await topUpTokens(token, expectedAddress, topupAmount)
    })

    it('should deploy funds recovery contract into expected address', async () => {
        contract = await FundsRecovery.new(nativeToken.address, { from: owner })
        expect(contract.address.toLowerCase()).to.be.equal(expectedAddress.toLowerCase())
    })

    it('only owner should successfully set funds destination', async () => {
        // Not contract owner can't set funds destination
        await contract.setFundsDestination(fundsDestination, { from: txMaker }).should.be.rejected
        expect(await contract.getFundsDestination()).to.be.equal(ZeroAddress)

        // Tx make from owner account should suceed
        await contract.setFundsDestination(fundsDestination, { from: owner }).should.be.fulfilled
        expect(await contract.getFundsDestination()).to.be.equal(fundsDestination)
    })

    it('anyone should successfully claim ethers', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await contract.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('anyone should successfully claim tokens', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await contract.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount;
        (await token.balanceOf(fundsDestination)).should.be.bignumber.equal(expectedBalance.toString())
    })

    it('native tokens should be not possible to claim', async () => {
        await topUpTokens(nativeToken, contract.address, OneToken)
        await contract.claimTokens(nativeToken.address).should.be.rejected
    })
})

contract('Registry funds recovery', ([_, txMaker, identity, account, fundsDestination, ...otherAccounts]) => {
    let token, channelImplementation, hermesImplementation, dex, registry, topupAmount, tokensAmount
    before(async () => {
        token = await Token.new()
        dex = await setupDEX(token, _)
        hermesImplementation = await HermesImplementation.new()
        channelImplementation = await ChannelImplementation.new(token.address, dex.address, identity, hermesImplementation.address, Zero)
    })

    it('should topup some ethers and tokens into future registry address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const registryAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected registry address
        topupAmount = 0.4 * OneEther
        await topUpEthers(otherAccounts[3], registryAddress, topupAmount)

        tokensAmount = web3.utils.toWei(new BN(8), 'ether')
        await topUpTokens(token, registryAddress, tokensAmount)

        const balance = await token.balanceOf(registryAddress)
        balance.should.be.bignumber.equal(tokensAmount)

        // Deploy registry smart contract
        const nativeToken = await Token.new() // Native token is used as main unit of value in channels. We're recovering any other tokens but not this.
        dex = await setupDEX(nativeToken, _)
        registry = await Registry.new({ from: txMaker })
        await registry.initialize(nativeToken.address, dex.address, 0, channelImplementation.address, hermesImplementation.address, ZeroAddress, { from: txMaker })
        expect(registry.address.toLowerCase()).to.be.equal(registryAddress.toLowerCase())

        // Set funds destination
        await registry.setFundsDestination(fundsDestination, { from: txMaker })
    })

    it('should recover ethers sent to registry before its deployment', async () => {
        const initialBalance = new BN(await web3.eth.getBalance(fundsDestination))
        const amount = new BN(topupAmount.toString())
        await registry.claimEthers().should.be.fulfilled
        const expectedBalance = initialBalance.add(amount)
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to registry', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await registry.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensAmount)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })
})

contract('Channel implementation funds recovery', ([_, txMaker, identity, identity2, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, channelImplementation, topupAmount, tokensToMint
    before(async () => {
        token = await Token.new()
        nativeToken = await Token.new()
    })

    it('should topup some ethers and tokens into future identity implementation smart contract address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const implementationAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.4 * OneEther
        await topUpEthers(otherAccounts[3], implementationAddress, topupAmount)

        tokensToMint = web3.utils.toWei(new BN(5), 'ether')
        await topUpTokens(token, implementationAddress, tokensToMint)

        const balance = await token.balanceOf(implementationAddress)
        balance.should.be.bignumber.equal(tokensToMint)

        // Deploy IdentityImplementation smart contract
        const hermesImplementation = await HermesImplementation.new()
        const dex = await setupDEX(nativeToken, _)
        channelImplementation = await ChannelImplementation.new(nativeToken.address, dex.address, txMaker, hermesImplementation.address, Zero, { from: txMaker })
        expect(channelImplementation.address.toLowerCase()).to.be.equal(implementationAddress.toLowerCase())

        // Set funds destination
        await channelImplementation.setFundsDestination(fundsDestination, { from: txMaker })
    })

    it('should recover ethers sent to identity implementation before its deployment', async () => {
        const initialBalance = new BN(await web3.eth.getBalance(fundsDestination))
        const amount = new BN(topupAmount.toString())
        await channelImplementation.claimEthers().should.be.fulfilled

        const expectedBalance = initialBalance.add(amount)
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to identity implementation smart contract', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await channelImplementation.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })

    it('native tokens should be not possible to claim', async () => {
        await topUpTokens(nativeToken, channelImplementation.address, OneToken)
        await channelImplementation.claimTokens(nativeToken.address).should.be.rejected
    })
})

contract('Hermes funds recovery', ([_, txMaker, account, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, hermesImplementation, topupAmount, tokensToMint, dex
    before(async () => {
        token = await Token.new()
        nativeToken = await Token.new()
        dex = await setupDEX(token, _)
    })

    it('should topup some ethers and tokens into future hermes smart contract address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const implementationAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.4 * OneEther
        await topUpEthers(otherAccounts[3], implementationAddress, topupAmount)

        tokensToMint = web3.utils.toWei(new BN(5), 'ether')
        await topUpTokens(token, implementationAddress, tokensToMint)

        // Deploy Hermes smart contract
        hermesImplementation = await TestHermesImplementation.new({ from: txMaker })
        await hermesImplementation.initialize(nativeToken.address, account, 0, 25, OneToken, dex.address)
        expect(hermesImplementation.address.toLowerCase()).to.be.equal(implementationAddress.toLowerCase())

        // Set funds destination
        await hermesImplementation.setFundsDestination(fundsDestination, { from: account })
    })

    it('should recover ethers sent to hermes contract before its deployment', async () => {
        const initialBalance = new BN(await web3.eth.getBalance(fundsDestination))

        topupAmount = new BN(topupAmount.toString())
        await hermesImplementation.claimEthers().should.be.fulfilled

        const expectedBalance = topupAmount.add(new BN(initialBalance))
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to hermes smart contract', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await hermesImplementation.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })

    it('native tokens should be not possible to claim', async () => {
        await topUpTokens(nativeToken, hermesImplementation.address, OneToken)
        await hermesImplementation.claimTokens(nativeToken.address).should.be.rejected
    })
})