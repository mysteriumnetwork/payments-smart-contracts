const { BN } = require('openzeppelin-test-helpers')
const { 
    deriveContractAddress,
    topUpEthers,
    topUpTokens
} = require('./utils')

const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const FundsRecovery = artifacts.require("FundsRecovery")

const OneEther = web3.utils.toWei(new BN(1), 'ether')
const ZeroAddress = '0x0000000000000000000000000000000000000000'

async function getExpectedSmartContractAddress(deployer) {
    const nonce = await web3.eth.getTransactionCount(deployer)
    return deriveContractAddress(deployer, nonce)
}

contract('General tests for funds recovery', ([txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, contract, expectedAddress, topupAmount
    before (async () => {
        token = await MystToken.new()

        // Toup some tokens and ethers into expected address
        expectedAddress = await getExpectedSmartContractAddress(owner)
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], expectedAddress, topupAmount)
        await topUpTokens(token, expectedAddress, topupAmount)
    })

    it('should deploy funds recovery contract into expected address', async () => {
        contract = await FundsRecovery.new({from: owner})
        expect(contract.address.toLowerCase()).to.be.equal(expectedAddress.toLowerCase())
    })

    it('only owner should successfully set funds destination', async () => {
        // Not contract owner can't set funds destination
        await contract.setFundsDestination(fundsDestination, {from: txMaker}).should.be.rejected
        expect(await contract.getFundsDestination()).to.be.equal(ZeroAddress)

        // Tx make from owner account should suceed
        await contract.setFundsDestination(fundsDestination, {from: owner}).should.be.fulfilled
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
})

contract('Dex funds recovery', ([_, txMaker, fundsDestination, ...otherAccounts]) => {
    let token, dex, proxy, proxiedDEX, topupAmount, tokensToMint
    before (async () => {
        token = await MystToken.new()
    })

    it('should topup some ethers and tokens into dex address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const dexAddress = deriveContractAddress(txMaker, nonce)

        // Toup some tokens and ethers into expected address
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], dexAddress, topupAmount)
        await topUpTokens(token, dexAddress, topupAmount)

        // Deploy dex smart contract
        dex = await MystDex.new({from: txMaker})
        expect(dex.address.toLowerCase()).to.be.equal(dexAddress.toLowerCase())

        // Set funds destination
        await dex.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to dex before deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await dex.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover tokens send to dex before deployment', async () => {
        await dex.claimTokens(token.address).should.be.fulfilled
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(tokensToMint.toString())
    })

    it('should topup some ethers and tokens into proxy address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const proxyAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.8 * OneEther
        await web3.eth.sendTransaction({
            from: otherAccounts[3],
            to: proxyAddress,
            value: topupAmount
        })
        expect(await web3.eth.getBalance(proxyAddress)).to.be.equal(topupAmount.toString())

        // Mint some tokens into expected proxyAddress
        tokensToMint = web3.utils.toWei(new BN(8), 'ether')
        await token.mint(proxyAddress, tokensToMint)

        const balance = await token.balanceOf(proxyAddress)
        balance.should.be.bignumber.equal(tokensToMint)

        // Deploy proxy smart contract
        proxy = await DEXProxy.new(dex.address, txMaker, {from: txMaker})
        proxiedDEX = await MystDex.at(proxy.address)
        expect(proxiedDEX.address.toLowerCase()).to.be.equal(proxyAddress.toLowerCase())

        // Initialise proxiedDex
        await proxiedDEX.initialise(txMaker, token.address, 1)

        // Set funds destination
        await proxiedDEX.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to proxy before deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await proxiedDEX.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover tokens send to proxy', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await proxiedDEX.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })

})

contract('Registry funds recovery', ([_, txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, identityImplementation, dex, registry, topupAmount, tokensToMint
    before (async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        identityImplementation = await IdentityImplementation.new(token.address, dex.address, owner, OneEther)
    })

    it('should topup some ethers and tokens into future registry address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const registryAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.4 * OneEther
        await web3.eth.sendTransaction({
            from: otherAccounts[3],
            to: registryAddress,
            value: topupAmount
        })
        expect(await web3.eth.getBalance(registryAddress)).to.be.equal(topupAmount.toString())

        // Mint some tokens into expected registryAddress
        tokensToMint = web3.utils.toWei(new BN(8), 'ether')
        await token.mint(registryAddress, tokensToMint)

        const balance = await token.balanceOf(registryAddress)
        balance.should.be.bignumber.equal(tokensToMint)

        // Deploy registry smart contract
        registry = await IdentityRegistry.new(token.address, dex.address, owner, {from: txMaker})
        expect(registry.address.toLowerCase()).to.be.equal(registryAddress.toLowerCase())

        // Set funds destination
        await registry.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to registry before its deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await registry.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to registry', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await registry.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })
})

contract('Identity implementation funds recovery', ([_, txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, identityImplementation, dex, topupAmount, tokensToMint
    before (async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
    })

    it('should topup some ethers and tokens into future identity implementation smart contract address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const implementationAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.4 * OneEther
        await web3.eth.sendTransaction({
            from: otherAccounts[3],
            to: implementationAddress,
            value: topupAmount
        })
        expect(await web3.eth.getBalance(implementationAddress)).to.be.equal(topupAmount.toString())

        // Mint some tokens into expected identity implementation address
        tokensToMint = web3.utils.toWei(new BN(5), 'ether')
        await token.mint(implementationAddress, tokensToMint)

        const balance = await token.balanceOf(implementationAddress)
        balance.should.be.bignumber.equal(tokensToMint)

        // Deploy IdentityImplementation smart contract
        identityImplementation = await IdentityImplementation.new(token.address, dex.address, owner, OneEther, {from: txMaker})
        expect(identityImplementation.address.toLowerCase()).to.be.equal(implementationAddress.toLowerCase())

        // Set funds destination
        await identityImplementation.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to identity implementation before its deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await identityImplementation.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to identity implementation smart contract', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await identityImplementation.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })
})
