require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')

const { topUpTokens } = require('./utils/index.js')

const OldMystToken = artifacts.require("OldMystToken")
const MystToken = artifacts.require("MystToken")
const TestMystToken = artifacts.require("TestMystToken")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const HalfToken = web3.utils.toWei(new BN('50000000'), 'wei')

const Zero = new BN(0)
const Multiplier = new BN('10000000000')  // New token has 18 zeros instead of 8
const states = {
    unknown: new BN(0),
    notAllowed: new BN(1),
    waitingForAgent: new BN(2),
    readyToUpgrade: new BN(3),
    upgrading: new BN(4)
}

contract('ERC20 token migration', ([txMaker, addressOne, addressTwo, ...otherAddresses]) => {
    let token, newToken, totalSupply
    before(async () => {
        token = await OldMystToken.new()
        await topUpTokens(token, txMaker, OneToken)
        await topUpTokens(token, addressOne, new BN('123'))
        await topUpTokens(token, addressTwo, new BN('321'))
        totalSupply = await token.totalSupply()

        newToken = await MystToken.new(token.address, totalSupply, [])
    })

    it('should fail migration when it is not enabled', async () => {
        await token.upgrade(await token.balanceOf(addressOne), { from: addressOne }).should.be.rejected
    })

    it('should enable token migration', async () => {
        const initialUpgradeState = await token.getUpgradeState()
        initialUpgradeState.should.be.bignumber.equal(states.waitingForAgent)

        await token.setUpgradeAgent(newToken.address)
        expect(await token.upgradeAgent()).to.be.equal(newToken.address)

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.readyToUpgrade)
    })

    it('should properly migrate tokens', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        await token.upgrade(initialAddressOneBalance, { from: addressOne })
        const addressOneBalance = await token.balanceOf(addressOne)
        addressOneBalance.should.be.bignumber.equal(Zero)

        const expectedTotalSupply = totalSupply.sub(initialAddressOneBalance)
        totalSupply = await token.totalSupply()
        totalSupply.should.be.bignumber.equal(expectedTotalSupply)

        const newTokenSupply = await newToken.totalSupply()
        newTokenSupply.should.be.bignumber.equal(initialAddressOneBalance.mul(Multiplier))

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.upgrading)
    })

    it('should fail migration', async () => {
        const initialTokenSupply = await token.totalSupply()
        const initialNewTokenSupply = await newToken.totalSupply()

        // Should fail because there are no tokens in addressOne
        await token.upgrade(new BN(0), { from: addressOne }).should.be.rejected

        // Should fail when trying to migrate more than user has
        await token.upgrade(OneToken, { from: addressTwo }).should.be.rejected

        // token supply should stay untouched
        initialTokenSupply.should.be.bignumber.equal(await token.totalSupply())
        initialNewTokenSupply.should.be.bignumber.equal(await newToken.totalSupply())
    })

    it('should migrate properly in two phases', async () => {
        const initialBalance = await token.balanceOf(txMaker)

        // First migration phase
        await token.upgrade(HalfToken)
        let txMakerBalance = await token.balanceOf(txMaker)
        txMakerBalance.should.be.bignumber.equal(initialBalance.sub(HalfToken))

        // Second migration phase
        await token.upgrade(HalfToken)
        txMakerBalance = await token.balanceOf(txMaker)
        txMakerBalance.should.be.bignumber.equal(Zero)

        // txMaker should have all his tokens on new token
        const balance = await newToken.balanceOf(txMaker)
        balance.should.be.bignumber.equal(OneToken.mul(Multiplier))

        // No more tokens
        await token.upgrade(HalfToken).should.be.rejected
    })

    it('should fail settting upgrade agent while in upgrading stage', async () => {
        const nextToken = await MystToken.new(token.address, totalSupply, [])
        await token.setUpgradeAgent(nextToken.address).should.be.rejected
    })

    it('should fail when minting tokens not via upgrade procedure', async () => {
        await newToken.upgradeFrom(addressTwo, 1).should.be.rejected
    })

    it('all tokens should be moved after last address will finish migration', async () => {
        await token.upgrade(await token.balanceOf(addressTwo), { from: addressTwo })
        const tokenSupply = await token.totalSupply()
        tokenSupply.should.be.bignumber.equal(Zero)

        // New token total supply should be equal original token supply
        const originalSupply = (await newToken.originalSupply()).mul(Multiplier)
        originalSupply.should.be.bignumber.equal(await newToken.totalSupply())
    })
})

contract('ERC777 token migration', ([txMaker, addressOne, addressTwo, ...otherAddresses]) => {
    let oldToken, token, newToken, totalSupply
    before(async () => {
        oldToken = await OldMystToken.new()
        await topUpTokens(oldToken, txMaker, OneToken)
        await topUpTokens(oldToken, addressOne, new BN('123'))
        await topUpTokens(oldToken, addressTwo, new BN('321'))
        totalSupply = await oldToken.totalSupply()

        token = await MystToken.new(oldToken.address, totalSupply, [])
        newToken = await TestMystToken.new()
        newToken.initilize(token.address, totalSupply.mul(Multiplier))
    })

    it('should migrate from ERC20 to ERC777 token', async () => {
        // Enable token migration for old ERC20 token
        await oldToken.setUpgradeAgent(token.address)

        // Migrate tokens into ERC777 token
        const txMakerBalance = await oldToken.balanceOf(txMaker)
        await oldToken.upgrade(txMakerBalance, { from: txMaker })

        const addressOneBalace = await oldToken.balanceOf(addressOne)
        await oldToken.upgrade(addressOneBalace, { from: addressOne })

        const addressTwoBalace = await oldToken.balanceOf(addressTwo)
        await oldToken.upgrade(addressTwoBalace, { from: addressTwo })

        // Recheck token balances
        txMakerBalance.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(txMaker))
        addressOneBalace.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(addressOne))
        addressTwoBalace.mul(Multiplier).should.be.bignumber.equal(await token.balanceOf(addressTwo))

        totalSupply.mul(Multiplier).should.be.bignumber.equal(await token.totalSupply())
    })

    it('should fail migration when it is not enabled', async () => {
        await token.upgrade(await token.balanceOf(addressOne), { from: addressOne }).should.be.rejected
    })

    it('should fail sending tokens into token address', async () => {
        await token.send(token.address, await token.balanceOf(addressOne), Buffer.from(''), { from: addressOne }).should.be.rejected
    })

    it('should enable token migration for ERC777 based token', async () => {
        const initialUpgradeState = await token.getUpgradeState()
        initialUpgradeState.should.be.bignumber.equal(states.waitingForAgent)

        await token.setUpgradeAgent(newToken.address)
        expect(await token.upgradeAgent()).to.be.equal(newToken.address)

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.readyToUpgrade)
    })

    it('should migrate tokens via upgrade function', async () => {
        const initialAddressOneBalance = await token.balanceOf(addressOne)
        await token.upgrade(initialAddressOneBalance, Buffer.from(''), { from: addressOne })
        const addressOneBalance = await token.balanceOf(addressOne)
        addressOneBalance.should.be.bignumber.equal(Zero)
        initialAddressOneBalance.should.be.bignumber.equal(await newToken.balanceOf(addressOne))

        const expectedTotalSupply = totalSupply.mul(Multiplier).sub(initialAddressOneBalance)
        totalSupply = await token.totalSupply()
        totalSupply.should.be.bignumber.equal(expectedTotalSupply)

        const newTokenSupply = await newToken.totalSupply()
        newTokenSupply.should.be.bignumber.equal(initialAddressOneBalance)

        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.upgrading)
    })

    it('should migrate tokens via simply sending them into token address', async () => {
        const initialAddressTwoBalance = await token.balanceOf(addressTwo)
        const initialNewTokenSupply = await newToken.totalSupply()

        await token.send(token.address, initialAddressTwoBalance, Buffer.from(''), { from: addressTwo })
        Zero.should.be.bignumber.equal(await token.balanceOf(addressTwo))
        initialAddressTwoBalance.should.be.bignumber.equal(await newToken.balanceOf(addressTwo))

        const expectedTotalSupply = totalSupply.sub(initialAddressTwoBalance)
        expectedTotalSupply.should.be.bignumber.equal(await token.totalSupply())

        const expectedNewTokenSupply = initialNewTokenSupply.add(initialAddressTwoBalance)
        expectedNewTokenSupply.should.be.bignumber.equal(await newToken.totalSupply())
    })

    it('ERC20 transfer() into token address should also migrate tokens', async () => {
        const initialTotalSupply = await token.totalSupply()
        const initialNewTokenSupply = await newToken.totalSupply()
        const initialTxMakerBalance = await token.balanceOf(txMaker)
        const amountToSend = HalfToken.mul(Multiplier)

        await token.transfer(token.address, amountToSend, { from: txMaker })

        const txMakerBalance = await token.balanceOf(txMaker)
        txMakerBalance.should.be.bignumber.equal(initialTxMakerBalance.sub(amountToSend))

        const txMakerMigratedBalance = await newToken.balanceOf(txMaker)
        txMakerMigratedBalance.should.be.bignumber.equal(amountToSend)

        const expectedTotalSupply = initialTotalSupply.sub(amountToSend)
        expectedTotalSupply.should.be.bignumber.equal(await token.totalSupply())

        const expectedNewTokenSupply = initialNewTokenSupply.add(amountToSend)
        expectedNewTokenSupply.should.be.bignumber.equal(await newToken.totalSupply())
    })

    it('should be possible to exchange tokens while migration in progress', async () => {
        const upgradeState = await token.getUpgradeState()
        upgradeState.should.be.bignumber.equal(states.upgrading)

        const amountToSend = await token.balanceOf(txMaker)
        await token.send(addressOne, amountToSend, Buffer.from(''), { from: txMaker })
        amountToSend.should.be.bignumber.equal(await token.balanceOf(addressOne))
        Zero.should.be.bignumber.equal(await token.balanceOf(txMaker))
    })

    it('should fail settting upgrade agent while in upgrading stage', async () => {
        const nextToken = await MystToken.new(token.address, totalSupply, [])
        await token.setUpgradeAgent(nextToken.address).should.be.rejected
    })

    it('should fail when minting tokens not via upgrade procedure', async () => {
        await newToken.upgradeFrom(addressTwo, 1).should.be.rejected
    })

    it('all tokens should be moved after last address will finish migration', async () => {
        await token.upgrade(await token.balanceOf(addressOne), Buffer.from(''), { from: addressOne })
        const tokenSupply = await token.totalSupply()
        tokenSupply.should.be.bignumber.equal(Zero)

        // New token total supply should be equal original token supply
        const originalSupply = await newToken.originalSupply()
        originalSupply.should.be.bignumber.equal(await newToken.totalSupply())
    })
})
