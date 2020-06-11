const { BN } = require('@openzeppelin/test-helpers');

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")

const OneEther = web3.utils.toWei(new BN(1), 'ether')

contract('DEX over Proxy', ([_, owner, ...otherAccounts]) => {
    let token, dex, proxy, proxiedImplementation
    before (async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        proxy = await DEXProxy.new(dex.address, owner)
        proxiedDEX = await MystDex.at(proxy.address)

        // Mint 10 000 tokens into dex account
        const tokensToMint = web3.utils.toWei(new BN(10000), 'ether')
        await token.mint(proxiedDEX.address, tokensToMint)

        const balance = await token.balanceOf(proxiedDEX.address)
        balance.should.be.bignumber.equal(tokensToMint)
    })

    it('should always work', () => {})

    it('tx should fail when DEX is not initialised', async () => {
        await proxiedDEX.sendTransaction({
            from: otherAccounts[0],
            value: 1,
            gas: 200000
        }).should.be.rejected
    })

    it('should initialise not initialised DEX', async () => {
        await proxiedDEX.initialise(owner, token.address, OneEther).should.be.fulfilled
        expect(await proxiedDEX.initialised()).to.be.true
    })

    it('second initialisation should fail', async () => {
        await proxiedDEX.initialise(owner, token.address, OneEther).should.be.rejected
    })

    it('should exchange ethers into tokens with 1:1 rate', async () => {
        const userAccount = otherAccounts[0]
        const ethersAmount = 7 * OneEther
        const tokenAmount = Number(await token.balanceOf(proxiedDEX.address))

        // Send some ethers into DEX
        await proxiedDEX.sendTransaction({
            from: userAccount,
            value: ethersAmount,
            gas: 200000
        })

        expect(Number(await token.balanceOf(userAccount))).to.be.equal(ethersAmount)
        expect(Number(await web3.eth.getBalance(proxiedDEX.address))).to.be.equal(ethersAmount)
        expect(Number(await token.balanceOf(proxiedDEX.address))).to.be.equal(tokenAmount - ethersAmount)
    })

    it('should fail setting new rate for not owner', async () => {
        const newRate = web3.utils.toWei(new BN(2), 'finney')
        await proxiedDEX.setRate(newRate).should.be.rejected
    })

    it('owner should be able to set new rate', async () => {
        const newRate = web3.utils.toWei(new BN(2), 'finney')

        // Owner should be able to set new rate
        await proxiedDEX.setRate(Number(newRate), {from: owner}).should.be.fulfilled

        // Ethers should be exchanged into tokens using new rate
        const userAccount = otherAccounts[1]
        const ethersAmount = OneEther
        const initialTokenBalance = await token.balanceOf(proxiedDEX.address)
        const dexEthers = new BN(await web3.eth.getBalance(proxiedDEX.address))

        await proxiedDEX.sendTransaction({
            from: userAccount,
            value: ethersAmount,
            gas: 200000
        })

        const userTokenBalance = await token.balanceOf(userAccount)
        const tokensToGet = ethersAmount.div(newRate) * 1e18
        const dexTokenBalance = await token.balanceOf(proxiedDEX.address)

        expect(await web3.eth.getBalance(proxiedDEX.address)).to.be.equal(ethersAmount.add(dexEthers).toString())
        expect(userTokenBalance.toString()).to.be.equal(tokensToGet.toString())
        dexTokenBalance.should.be.bignumber.equal(initialTokenBalance.sub(new BN(tokensToGet.toString())))
    })

    it('should reject tx if there are not enought tokens', async () => {
        const rate = web3.utils.toWei(new BN(2), 'finney')
        const userAccount = otherAccounts[2]
        const ethersAmount = OneEther.mul(new BN(30)) // 30 ethers
        const dexEthers = await web3.eth.getBalance(proxiedDEX.address)

        // There should be more tokens to get that amount DEX is owning
        const dexTokens = await token.balanceOf(proxiedDEX.address)
        const tokensToGet = ethersAmount.div(rate).mul(OneEther)
        tokensToGet.should.be.bignumber.greaterThan(dexTokens)

        // Transaction should fail
        await proxiedDEX.sendTransaction({
            from: userAccount,
            value: ethersAmount,
            gas: 200000
        }).should.be.rejected

        // Amount of tokens and ethers should state same as before transaction
        expect(await web3.eth.getBalance(proxiedDEX.address)).to.be.equal(dexEthers)
        dexTokens.should.be.bignumber.equal(await token.balanceOf(proxiedDEX.address))
    })
})
