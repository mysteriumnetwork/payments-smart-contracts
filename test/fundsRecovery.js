const { BN } = require('openzeppelin-test-helpers')
const { 
    deriveContractAddress,
    topUpEthers,
    topUpTokens
} = require('./utils/index.js')

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("TestChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const TestAccountantImplementation = artifacts.require("TestAccountantImplementation")
const Token = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const FundsRecovery = artifacts.require("TestFundsRecovery")

const OneEther = web3.utils.toWei(new BN(1), 'ether')
const OneToken = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'

async function getExpectedSmartContractAddress(deployer) {
    const nonce = await web3.eth.getTransactionCount(deployer)
    return deriveContractAddress(deployer, nonce)
}

contract('General tests for funds recovery', ([txMaker, owner, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, contract, expectedAddress, topupAmount
    before (async () => {
        token = await Token.new()
        nativeToken = await Token.new() // This special token which usually shoudn't be recoverable

        // Toup some tokens and ethers into expected address
        expectedAddress = await getExpectedSmartContractAddress(owner)
        topupAmount = tokensToMint = 0.7 * OneEther
        await topUpEthers(otherAccounts[3], expectedAddress, topupAmount)
        await topUpTokens(token, expectedAddress, topupAmount)
    })

    it('should deploy funds recovery contract into expected address', async () => {
        contract = await FundsRecovery.new(nativeToken.address, {from: owner})
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

    it('native tokens should be not possible to claim', async () => {
        await topUpTokens(nativeToken, contract.address, OneToken)
        await contract.claimTokens(nativeToken.address).should.be.rejected
    })
})

contract('Dex funds recovery', ([_, txMaker, fundsDestination, ...otherAccounts]) => {
    let token, dex, proxy, proxiedDEX, topupAmount, tokensToMint
    before (async () => {
        token = await Token.new()
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

contract('Registry funds recovery', ([_, txMaker, identity, account, fundsDestination, ...otherAccounts]) => {
    let token, channelImplementation, accountantImplementation, dex, registry, topupAmount, tokensAmount
    before (async () => {
        token = await Token.new()
        dex = await MystDex.new()
        accountantImplementation = await AccountantImplementation.new()
        channelImplementation = await ChannelImplementation.new(token.address, identity, accountantImplementation.address, Zero)
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
        registry = await Registry.new(nativeToken.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 0, {from: txMaker})
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

        const expectedBalance = initialBalance.add(tokensAmount)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })
})

contract('Channel implementation funds recovery', ([_, txMaker, identity, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, channelImplementation, topupAmount, tokensToMint
    before (async () => {
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
        const accountantImplementation = await AccountantImplementation.new()
        channelImplementation = await ChannelImplementation.new(nativeToken.address, identity, accountantImplementation.address, Zero, {from: txMaker})
        expect(channelImplementation.address.toLowerCase()).to.be.equal(implementationAddress.toLowerCase())

        // Set funds destination
        await channelImplementation.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to identity implementation before its deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await channelImplementation.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
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

contract('Accountant funds recovery', ([_, txMaker, account, fundsDestination, ...otherAccounts]) => {
    let token, nativeToken, accountantImplementation, topupAmount, tokensToMint
    before (async () => {
        token = await Token.new()
        nativeToken = await Token.new()
    })

    it('should topup some ethers and tokens into future accountant smart contract address', async () => {
        const nonce = await web3.eth.getTransactionCount(txMaker)
        const implementationAddress = deriveContractAddress(txMaker, nonce)

        // Topup some ethers into expected proxyAddress
        topupAmount = 0.4 * OneEther
        await topUpEthers(otherAccounts[3], implementationAddress, topupAmount)

        tokensToMint = web3.utils.toWei(new BN(5), 'ether')
        await topUpTokens(token, implementationAddress, tokensToMint)

        // Deploy Accountant smart contract
        accountantImplementation = await TestAccountantImplementation.new(nativeToken.address, account, {from: txMaker})
        expect(accountantImplementation.address.toLowerCase()).to.be.equal(implementationAddress.toLowerCase())

        // Set funds destination
        await accountantImplementation.setFundsDestination(fundsDestination, {from: txMaker})
    })

    it('should recover ethers sent to accountant contract before its deployment', async () => {
        const initialBalance = await web3.eth.getBalance(fundsDestination)

        await accountantImplementation.claimEthers().should.be.fulfilled

        const expectedBalance = Number(initialBalance) + topupAmount
        expect(await web3.eth.getBalance(fundsDestination)).to.be.equal(expectedBalance.toString())
    })

    it('should recover any tokens send to accountant smart contract', async () => {
        const initialBalance = await token.balanceOf(fundsDestination)

        await accountantImplementation.claimTokens(token.address).should.be.fulfilled

        const expectedBalance = initialBalance.add(tokensToMint)
        expect((await token.balanceOf(fundsDestination)).toString()).to.be.equal(expectedBalance.toString())
    })

    it('native tokens should be not possible to claim', async () => {
        await topUpTokens(nativeToken, accountantImplementation.address, OneToken)
        await accountantImplementation.claimTokens(nativeToken.address).should.be.rejected
    })
})