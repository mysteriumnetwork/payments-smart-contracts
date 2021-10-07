require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')
const { randomBytes } = require('crypto')

const { topUpTokens, setupDEX, generateChannelId, keccak, sleep } = require('./utils/index.js')
const {
    signIdentityRegistration,
    signChannelLoanReturnRequest,
    createPromise,
    generatePromise
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')
const { zeroAddress } = require('ethereumjs-util')

const MystToken = artifacts.require("TestMystToken")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("TestHermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const Thousand = new BN(1000)
const ChainID = 1
const hermesURL = Buffer.from('http://test.hermes')

const provider = wallet.generateAccount()
const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const hermesOperator = wallet.generateAccount(operatorPrivKey)

contract('Hermes stake and punishment management', ([txMaker, operatorAddress, ...beneficiaries]) => {
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
        await token.approve(registry.address, OneToken)   // approve a lot so it would enought for any case
    })

    it('should reject hermes registration if he do not pay enought stake', async () => {
        const stateAmount = stake - 1
        await registry.registerHermes(hermesOperator.address, stateAmount, Zero, 25, OneToken, hermesURL).should.be.rejected
    })

    it('should register hermes when stake is ok', async () => {
        await registry.registerHermes(hermesOperator.address, stake, Zero, 25, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(hermesOperator.address)
        hermes = await HermesImplementation.at(hermesId)
        expect(await registry.isHermes(hermes.address)).to.be.true
    })

    it('hermes should have available balance after sending some tokens into him', async () => {
        let availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(Zero)

        const amount = new BN(1000)
        await topUpTokens(token, hermes.address, amount)

        availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(amount)
    })

    it('should open provider channel and calculate zero available balance', async () => {
        const expectedChannelId = generateChannelId(provider.address, hermes.address)
        const initialHermesBalance = await token.balanceOf(hermes.address)
        const initialAvailableBalance = await hermes.availableBalance()

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
        expect(channel.stake.toNumber()).to.be.equal(channelStake.toNumber())

        // Hermes available balance should stay unchanged
        const availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(initialAvailableBalance)
    })

    it('should settle promise', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const amount = new BN(250)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        // Create hermes promise and settle it
        const promise = createPromise(ChainID, channelId, amount, Zero, hashlock, hermesOperator)
        await hermes.settlePromise(provider.address, promise.amount, promise.fee, R, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })

    it('settle more than hermes available balance and enable punishment mode', async () => {
        const initialAvailableBalance = await hermes.availableBalance()
        initialAvailableBalance.should.be.bignumber.greaterThan(Zero)

        const channelId = generateChannelId(provider.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = initialAvailableBalance.add(Thousand) // promise amount should be bigger that available hermes balance

        // Settle promise
        const promise = generatePromise(amountToPay, Zero, channelState, hermesOperator, provider.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        // There should be zoro available hermes balance
        const availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(Zero)

        // Because of not getting all expected balance, there should be enabled punishment mode
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)
        expect(await hermes.isHermesActive()).to.be.false
    })

    it('hermes stake should remain untouched', async () => {
        const hermesStake = await hermes.getHermesStake()
        hermesStake.should.be.bignumber.equal(stake)

        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.equal(await hermes.minimalExpectedBalance())
    })


    // -------------- Testing punishment mode --------------

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
    })

    it('provider should be able to get his stake back (at least part of it)', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const channelStakeAmount = (await hermes.channels(channelId)).stake
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaries[0])

        const nonce = new BN(1)
        const signature = signChannelLoanReturnRequest(channelId, channelStakeAmount, Zero, nonce, provider)
        await hermes.decreaseStake(provider.address, channelStakeAmount, Zero, signature)

        const channel = await hermes.channels(channelId)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        initialBeneficiaryBalance.should.be.bignumber.lessThan(beneficiaryBalance)
        channel.stake.should.be.bignumber.lessThan(channelStakeAmount)
    })

    it('should fail resolving emergency when txMaker balance is not enough', async () => {
        expect(await hermes.isHermesActive()).to.be.false
        await hermes.resolveEmergency().should.be.rejected
    })

    it('should successfully resolve emergency', async () => {
        expect(await hermes.isHermesActive()).to.be.false

        const initialPunishmentAmount = (await hermes.punishment()).amount

        // Ensure txMaker to have enough tokens to resolve emergency
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(hermes.address, OneToken)

        // Wait a little
        await sleep(1000)

        await hermes.resolveEmergency()

        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(0)
        expect(await hermes.isHermesActive()).to.be.true

        // Because emergency was resolved fast enought, punishment amount should be not increased
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

        // Ensure that hermes has enought funds
        await topUpTokens(token, hermes.address, OneToken)

        // Should be able to settle promise
        const channelId = generateChannelId(newProvider.address, hermes.address)
        const R = randomBytes(32)
        const hashlock = keccak(R)
        const promiseAmount = channelStake

        const promise = createPromise(ChainID, channelId, promiseAmount, Zero, hashlock, hermesOperator)
        await hermes.settlePromise(newProvider.address, promise.amount, promise.fee, R, promise.signature)

        expect(await hermes.isHermesActive()).to.be.true
    })

    it('should enable punishment mode again', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)

        // Withdraw available balance
        const availableBalance = await hermes.availableBalance()
        await hermes.withdraw(beneficiaries[3], availableBalance, { from: operatorAddress })

        // Ensure channel's stake
        const amount = new BN(1000)
        await topUpTokens(token, txMaker, amount)
        await token.approve(hermes.address, amount)
        await hermes.increaseStake(channelId, amount, { from: txMaker })

        // Create and settle promise
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const promise = generatePromise(amount, Zero, channelState, hermesOperator, provider.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        // Status should be in punishment mode
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)
        expect(await hermes.isHermesActive()).to.be.false
    })

    it('should be not possible to close hermes while in punishment mode', async () => {
        expect((await hermes.getStatus()).toNumber()).to.be.equal(2)  // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        await hermes.closeHermes({ from: operatorAddress }).should.be.rejected
    })

    it('hermes should be punished for not resolving emergency on time', async () => {
        const totalStake = await hermes.getTotalStake()

        // Move blockchain forward
        await sleep(4500) // a little more than 2 units of time
        await hermes.moveBlock()

        // Topup tokens into txMaker and approve hermes to use them during resolveEmergency call.
        await topUpTokens(token, txMaker, OneToken, { from: txMaker })
        await token.approve(hermes.address, OneToken)

        await hermes.resolveEmergency()

        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(0)

        // Emergency was resolved after 10 blocks (within 2 unit of time),
        // punishment amount should be 0.08% of locked in channels funds.
        const expectedPunishment = totalStake * 0.04 * 2
        const punishmentAmount = (await hermes.punishment()).amount.toNumber()
        expect(punishmentAmount).to.be.equal(expectedPunishment)

        expect(await hermes.isHermesActive()).to.be.true
    })

})
