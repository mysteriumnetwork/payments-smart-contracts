require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('web3-utils')

const { topUpTokens, setupDEX, sleep } = require('./utils/index.js')
const {
    signIdentityRegistration,
    signChannelBalanceUpdate,
    signChannelLoanReturnRequest,
    createPromise
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')

const MystToken = artifacts.require("TestMystToken")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("TestHermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const hermesURL = Buffer.from('http://test.hermes')

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const hermesOperator = wallet.generateAccount(operatorPrivKey)

contract('Hermes closing', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, hermes, registry, stake
    before(async () => {
        stake = OneToken

        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new(token.address, hermesOperator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, stake, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it('should register hermes', async () => {
        await registry.registerHermes(hermesOperator.address, stake, Zero, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(hermesOperator.address)
        hermes = await HermesImplementation.at(hermesId)
        expect(await registry.isHermes(hermes.address)).to.be.true
    })

    it('should be able to close hermes', async () => {
        const initialBalance = await token.balanceOf(hermes.address)
        expect((await hermes.getStatus()).toNumber()).to.be.equal(0)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        await hermes.closeHermes({ from: operatorAddress })
        expect((await hermes.getStatus()).toNumber()).to.be.equal(3)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        const currentBalance = await token.balanceOf(hermes.address)
        initialBalance.should.be.bignumber.equal(currentBalance)
    })

    it('should fail getting stake back until timelock passes', async () => {
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        expect((await web3.eth.getBlock('latest')).number).to.be.below(expectedBlockNumber)
        await hermes.getStakeBack(beneficiaries[0], { from: operatorAddress }).should.be.rejected
    })

    it('should allow to get stake back after timelock passes', async () => {
        const initialHermesBalance = await token.balanceOf(hermes.address)
        const expectedBlockTime = (await web3.eth.getBlock('latest')).timestamp + 1

        // Wait till time will pass and procude new block
        await sleep(3000)
        await hermes.moveBlock()
        expect((await web3.eth.getBlock('latest')).timestamp).to.be.above(expectedBlockTime)

        await hermes.getStakeBack(beneficiaries[0], { from: operatorAddress })

        const currentHermesBalance = await token.balanceOf(hermes.address)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        beneficiaryBalance.should.be.bignumber.equal(initialHermesBalance)
        currentHermesBalance.should.be.bignumber.equal(Zero)
    })

})