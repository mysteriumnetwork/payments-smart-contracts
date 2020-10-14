require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')
const { randomBytes } = require('crypto')

const { topUpTokens, setupDEX, generateChannelId, keccak } = require('./utils/index.js')
const {
    signIdentityRegistration,
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
const ChainID = 1
const hermesURL = Buffer.from('http://test.hermes')

const provider = wallet.generateAccount()
const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const hermesOperator = wallet.generateAccount(operatorPrivKey)

contract('Hermes punishment', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, hermes, registry, stake
    before(async () => {
        stake = OneToken

        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new(token.address, hermesOperator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, stake, channelImplementation.address, hermesImplementation.address)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it('should register hermes', async () => {
        await registry.registerHermes(hermesOperator.address, stake, Zero, 25, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(hermesOperator.address)
        hermes = await HermesImplementation.at(hermesId)
        expect(await registry.isHermes(hermes.address)).to.be.true
    })

    it('should open provider channel and calculate zero available balance', async () => {
        const expectedChannelId = generateChannelId(provider.address, hermes.address)
        const initialHermesBalance = await token.balanceOf(hermes.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(1000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(provider.address, hermes.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, channelStake, Zero, beneficiaries[0], provider)
        await registry.registerIdentity(hermes.address, channelStake, Zero, beneficiaries[0], signature)
        expect(await registry.isRegistered(provider.address)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to hermes
        const hermesTokenBalance = await token.balanceOf(hermes.address)
        hermesTokenBalance.should.be.bignumber.equal(initialHermesBalance.add(channelStake))

        const channel = await hermes.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())

        // Hermes should still not have available balance
        const availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(Zero)
    })

    it('should settle promise and decrease channel balance', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const amount = new BN(250)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        // Create hermes promise
        const promise = createPromise(ChainID, channelId, amount, Zero, hashlock, hermesOperator)

        // Settle promise
        const initialChannelBalance = (await hermes.channels(channelId)).balance
        const expectedChannelBalance = initialChannelBalance.sub(amount)

        await hermes.settlePromise(provider.address, promise.amount, promise.fee, R, promise.signature)

        const channelBalance = (await hermes.channels(channelId)).balance
        channelBalance.should.be.bignumber.equal(expectedChannelBalance)
    })

    it('should rebalance channel only with available balance and enable punishment mode', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const rebalanceAmount = channel.stake.sub(channel.balance)
        const initialStake = await hermes.getHermesStake()

        // Make hermes available balance to be half of needed
        await topUpTokens(token, hermes.address, rebalanceAmount / 2)

        // Rebalance channel
        await hermes.rebalanceChannel(channelId)

        // Stake should remain untouched
        const hermesStake = await hermes.getHermesStake()
        expect(hermesStake.toNumber()).to.be.equal(initialStake.toNumber())

        // There should be zero available balance
        expect((await hermes.availableBalance()).toNumber()).to.be.equal(0)

        // Because of not getting all expected balance, there should be enabled punishment mode
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)
        expect(await hermes.isHermesActive()).to.be.false
    })

    it('should not allow to register new identity with hermes in punishment mode', async () => {
        const newProvider = wallet.generateAccount()
        const channelStake = new BN(1000)

        // Ensure that hermes is in punishment mode
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(newProvider.address, hermes.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Registering any kind of identity with hermes should fail
        let signature = signIdentityRegistration(registry.address, hermes.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(hermes.address, channelStake, Zero, beneficiaries[1], signature).should.be.rejected

        signature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaries[1], signature).should.be.rejected
    })

    it('should still allow to increase channel stake', async () => {
        const amountToStake = new BN('1500')
        const channelId = generateChannelId(provider.address, hermes.address)
        const initialChannelStake = (await hermes.channels(channelId)).stake

        // txMaker should have enought tokens
        await topUpTokens(token, txMaker, amountToStake)
        await token.approve(hermes.address, amountToStake)

        // Should increase channel stake
        await hermes.increaseStake(channelId, amountToStake)

        const channel = await hermes.channels(channelId)
        channel.stake.should.be.bignumber.equal(initialChannelStake.add(amountToStake))
        channel.balance.should.be.bignumber.equal(initialChannelStake.add(amountToStake))
    })

    it('provider should be able to get his stake back (at least part of it)', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const channelStakeAmount = (await hermes.channels(channelId)).stake
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaries[0])

        const nonce = new BN(1)
        const signature = signChannelLoanReturnRequest(channelId, channelStakeAmount, Zero, nonce, provider)
        await hermes.decreaseStake(channelId, channelStakeAmount, Zero, signature)

        const channel = await hermes.channels(channelId)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        initialBeneficiaryBalance.should.be.bignumber.lessThan(beneficiaryBalance)
        channel.stake.should.be.bignumber.lessThan(channelStakeAmount)
    })

    it('hermes operator should not be able to update channel balance', async () => {
        const newBalance = new BN('10')
        await topUpTokens(token, txMaker, newBalance)

        const channelId = generateChannelId(provider.address, hermes.address)
        await hermes.updateChannelBalance(channelId, newBalance, { from: operatorAddress }).should.be.rejected
    })

    it('should fail resolving emergency when txMaker balance is not enough', async () => {
        await hermes.resolveEmergency().should.be.rejected
    })

    it('should successfully resolve emergency', async () => {
        const initialPunishmentAmount = (await hermes.punishment()).amount

        // Ensure txMaker to have enough tokens to resolve emergency
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(hermes.address, OneToken)

        await hermes.resolveEmergency()

        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(0)

        // Because emergency was resolved in one hour, punishment amount should be not increased
        const punishmentAmount = (await hermes.punishment()).amount
        punishmentAmount.should.be.bignumber.equal(initialPunishmentAmount)
    })

    it('should fail calling resolveEmergency() when not in punishment mode', async () => {
        expect(await hermes.isHermesActive()).to.be.true
        await hermes.resolveEmergency().should.be.rejected
    })

    it('should all back to normal', async () => {
        // Should allow to register new identity
        const newProvider = wallet.generateAccount()
        const channelStake = new BN(1000)

        const channelAddress = await registry.getChannelAddress(newProvider.address, hermes.address)
        await topUpTokens(token, channelAddress, channelStake)

        let signature = signIdentityRegistration(registry.address, hermes.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(hermes.address, channelStake, Zero, beneficiaries[1], signature)

        // Should fully rebalance channel
        const channelId = generateChannelId(provider.address, hermes.address)
        await hermes.rebalanceChannel(channelId)
        let channel = await hermes.channels(channelId)
        channel.balance.should.be.bignumber.equal(channel.stake)

        // Operator should be able to update channel balance
        const newBalance = new BN(70000)
        await topUpTokens(token, hermes.address, newBalance)
        await hermes.updateChannelBalance(channelId, newBalance, { from: operatorAddress })
        channel = await hermes.channels(channelId)
        channel.balance.should.be.bignumber.equal(newBalance)

        expect(await hermes.isHermesActive()).to.be.true
    })

    it('should enable punishment mode again', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const channel = await hermes.channels(channelId)

        // Withdraw available balance
        const availableBalance = await hermes.availableBalance()
        await hermes.withdraw(beneficiaries[3], availableBalance, { from: operatorAddress })

        // Create hermes promise
        const amount = channel.settled.add(channel.balance)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        const promise = createPromise(ChainID, channelId, amount, Zero, hashlock, hermesOperator)

        // Settle promise
        await hermes.settlePromise(provider.address, promise.amount, promise.fee, R, promise.signature)
        const channelBalance = (await hermes.channels(channelId)).balance
        channelBalance.should.be.bignumber.equal(Zero)

        // Rebalance channel and move status into punishment mode
        await hermes.rebalanceChannel(channelId)
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)
        expect(await hermes.isHermesActive()).to.be.false
    })

    it('should be not possible to close hermes while in punishment mode', async () => {
        expect((await hermes.getStatus()).toNumber()).to.be.equal(2)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        await hermes.closeHermes({ from: operatorAddress }).should.be.rejected
    })

    it('hermes should be punished for not resolving emergency on time', async () => {
        const initialLockedFunds = await hermes.getLockedFunds()

        // Move blockchain forward
        for (let i = 0; i < 10; i++) {
            await hermes.moveBlock()
        }

        await hermes.resolveEmergency()

        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(0)

        // Emergency was resolved after 10 blocks (within 2 unit of time),
        // punishment amount should be 0.08% of locked in channel funds.
        const expectedPunishment = initialLockedFunds * 0.04 * 2
        const punishmentAmount = (await hermes.punishment()).amount.toNumber()
        expect(punishmentAmount).to.be.equal(expectedPunishment)

        expect(await hermes.isHermesActive()).to.be.true
    })

    it('should reduce stake return by punishment amount', async () => {
        const initialHermesBalance = await token.balanceOf(hermes.address)
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        const punishmentAmount = (await hermes.punishment()).amount

        await hermes.closeHermes({ from: operatorAddress })
        expect((await hermes.getStatus()).toNumber()).to.be.equal(3)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed

        // Move blockchain forward
        for (let i = 0; i < 5; i++) {
            await hermes.moveBlock()
        }
        expect((await web3.eth.getBlock('latest')).number).to.be.above(expectedBlockNumber)

        await hermes.getStakeBack(beneficiaries[4], { from: operatorAddress })

        const currentHermesBalance = await token.balanceOf(hermes.address)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[4])
        beneficiaryBalance.should.be.bignumber.equal(initialHermesBalance.sub(punishmentAmount))
        currentHermesBalance.should.be.bignumber.equal(punishmentAmount)
    })

})
