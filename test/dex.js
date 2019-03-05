require('chai')
    .use(require('chai-as-promised'))
    .should()

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")

contract('Mysterium simplified DEX', ([_, owner, ...otherAccounts]) => {
    let token, dex
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        await dex.initialise(owner, token.address, 1)

        // Mint tokens into dex account
        const tokensToMint = 1000000
        await token.mint(dex.address, tokensToMint)
        expect(Number(await token.balanceOf(dex.address))).to.be.equal(tokensToMint)
    })

    it('should exchange ethers into tokens with 1:1 rate', async () => {
        const userAccount = otherAccounts[0]
        const etherAmount = 7
        const tokenAmount = Number(await token.balanceOf(dex.address))

        // Send some ethers into DEX
        await dex.sendTransaction({
            from: userAccount,
            value: etherAmount,
            gas: 200000
        })

        expect(Number(await token.balanceOf(userAccount))).to.be.equal(etherAmount)
        expect(Number(await web3.eth.getBalance(dex.address))).to.be.equal(etherAmount)
        expect(Number(await token.balanceOf(dex.address))).to.be.equal(tokenAmount - etherAmount)
    })

    it('only owner should be able to set new rate', async () => {
        const newRate = 7000
        
        // Transaction not from dex owner should be rejected
        await dex.setRate(newRate).should.be.rejected
        
        // Owner should be able to set new rate
        await dex.setRate(newRate, {from: owner}).should.be.fulfilled
        
        // Ethers should be exchanged into tokens using new rate
        const userAccount = otherAccounts[1]
        const etherAmount = 9
        const tokenAmount = Number(await token.balanceOf(dex.address))
        const dexEthers = Number(await web3.eth.getBalance(dex.address))
        await dex.sendTransaction({
            from: userAccount,
            value: etherAmount,
            gas: 200000
        })

        expect(Number(await token.balanceOf(userAccount))).to.be.equal(etherAmount * newRate)
        expect(Number(await web3.eth.getBalance(dex.address))).to.be.equal(dexEthers + etherAmount)
        expect(Number(await token.balanceOf(dex.address))).to.be.equal(tokenAmount - (etherAmount * newRate))
    })
})
