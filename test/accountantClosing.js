require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')

const { topUpTokens } = require('./utils/index.js')
const {
    signIdentityRegistration,
    signChannelBalanceUpdate,
    signChannelLoanReturnRequest,
    createPromise
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("TestAccountantImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const accountantOperator = wallet.generateAccount(operatorPrivKey)

contract('Accountant closing', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, accountant, registry, stake
    before(async () => {
        stake = OneToken

        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new(token.address, accountantOperator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, Zero, stake, channelImplementation.address, accountantImplementation.address)

        // Topup some tokens into txMaker address so it could register accountant
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it('should register accountant', async () => {
        await registry.registerAccountant(accountantOperator.address, stake, Zero, OneToken)
        const accountantId = await registry.getAccountantAddress(accountantOperator.address)
        accountant = await AccountantImplementation.at(accountantId)
        expect(await registry.isAccountant(accountant.address)).to.be.true
    })

    it('should be able to close accountant', async () => {
        const initialBalance = await token.balanceOf(accountant.address)
        expect((await accountant.getStatus()).toNumber()).to.be.equal(0)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        await accountant.closeAccountant({ from: operatorAddress })
        expect((await accountant.getStatus()).toNumber()).to.be.equal(3)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        const currentBalance = await token.balanceOf(accountant.address)
        initialBalance.should.be.bignumber.equal(currentBalance)
    })

    it('should fail getting stake back until timelock passes', async () => {
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        expect((await web3.eth.getBlock('latest')).number).to.be.below(expectedBlockNumber)
        await accountant.getStakeBack(beneficiaries[0], { from: operatorAddress }).should.be.rejected
    })

    it('should allow to get stake back after timelock passes', async () => {
        const initialAccountantBalance = await token.balanceOf(accountant.address)
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4

        // Move blockchain forward
        for (let i = 0; i < 5; i++) {
            await accountant.moveBlock()
        }
        expect((await web3.eth.getBlock('latest')).number).to.be.above(expectedBlockNumber)

        await accountant.getStakeBack(beneficiaries[0], { from: operatorAddress })

        const currentAccountantBalance = await token.balanceOf(accountant.address)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        beneficiaryBalance.should.be.bignumber.equal(initialAccountantBalance)
        currentAccountantBalance.should.be.bignumber.equal(Zero)
    })

})