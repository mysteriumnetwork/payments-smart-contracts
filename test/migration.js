require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')

const { topUpTokens } = require('./utils/index.js')

const OldMystToken = artifacts.require("OldMystToken")
const MystToken = artifacts.require("MystToken")

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

        newToken = await MystToken.new(token.address)
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
        const nextToken = await MystToken.new(token.address)
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
