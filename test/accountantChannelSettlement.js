/*
    This test is testing channel creating via settlement. It also tests partial stake increase.
    Tested functions can be found in smart-contract code at `contracts/AccountantImplementation.sol`.
*/

const { BN } = require('@openzeppelin/test-helpers')
const {
    generateChannelId,
    topUpTokens,
    topUpEthers
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const {
    signStakeGoalUpdate,
    signIdentityRegistration,
    generatePromise
} = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const AccountantImplementation = artifacts.require("TestAccountantImplementation")

const ChannelImplementation = artifacts.require("ChannelImplementation")
const Registry = artifacts.require("Registry")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

const operator = wallet.generateAccount(Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex'))  // Generate accountant operator wallet
const providerA = wallet.generateAccount()
const providerB = wallet.generateAccount()

const minStake = new BN(25)

contract("Channel openinig via settlement tests", ([txMaker, beneficiaryA, beneficiaryB, beneficiaryC, ...otherAccounts]) => {
    let token, hermes, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const hermesImplementation = await AccountantImplementation.new(token.address, operator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, 0, 100, channelImplementation.address, hermesImplementation.address)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize hermes hub", async () => {
        await registry.registerAccountant(operator.address, 1000, Zero, OneToken)
        const hermesId = await registry.getAccountantAddress(operator.address)
        expect(await registry.isAccountant(hermesId)).to.be.true

        // Initialise hermes object
        hermes = await AccountantImplementation.at(hermesId)

        // Topup some balance for hermes
        await topUpTokens(token, hermes.address, new BN(100000))
    })

    it("register consumer identity", async () => {
        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryA, providerA)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryA, regSignature)
        expect(await registry.isRegistered(providerA.address)).to.be.true
    })

    it("should open provider channel while settling promise", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))

        const consumerChannelAddress = await registry.getChannelAddress(providerA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.

        const amountToPay = new BN('15')
        const balanceBefore = await token.balanceOf(consumerChannelAddress)

        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(consumerChannelAddress)
        const amountToSettle = amountToPay.sub(amountToPay.div(new BN(10))) // amountToPay - 10% which will be used as stake
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToSettle))

        expect(await hermes.isChannelOpened(channelId)).to.be.true
    })

    it("settling promises bigger than stake should be handled correctly", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const channelState = Object.assign({}, { channelId }, channel)
        const initialChannelStake = channel.stake
        const amountToPay = new BN('275')

        const consumerChannelAddress = await registry.getChannelAddress(providerA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.
        const balanceBefore = await token.balanceOf(consumerChannelAddress)

        // Amount to pay should be bigger than channel's stake and minimal allowed stake
        amountToPay.should.be.bignumber.greaterThan(initialChannelStake)
        minStake.should.be.bignumber.greaterThan(initialChannelStake)

        // Generate and settle promise
        promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        // Stake should increase by 10% of settled amount
        const channelStakeAfter = (await hermes.channels(channelId)).stake
        const stakeIncrease = minStake.div(new BN(10))
        channelStakeAfter.should.be.bignumber.equal(initialChannelStake.add(stakeIncrease))

        // Promise can't settle more that channel's stake.
        const balanceAfter = await token.balanceOf(consumerChannelAddress)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(minStake.sub(stakeIncrease)))
    })

    it("should be possible use same promise multiple times untill whole amount is not settled", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const consumerChannelAddress = await registry.getChannelAddress(providerA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.
        const stakeIncrease = minStake.div(new BN(10))

        // It should ve possible to use promise couple of times
        for (let times = 1; times < 11; times++) {
            const balanceBefore = await token.balanceOf(consumerChannelAddress)

            await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

            const balanceAfter = await token.balanceOf(consumerChannelAddress)
            balanceAfter.should.be.bignumber.equal(balanceBefore.add(minStake.sub(stakeIncrease)))
        }

        // Promise settlement should fail when there a no unsettled tokens anymore
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature).should.be.rejected
    })

    it("should reach min stake and not take stake during settlement anymore", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const channelState = Object.assign({}, { channelId }, channel)
        const amountToPay = new BN('50')
        const consumerChannelAddress = await registry.getChannelAddress(providerA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.

        // Generate and settle promise
        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        await hermes.settleAndRebalance(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        // It should reach minStake
        const channelStakeAfter = (await hermes.channels(channelId)).stake
        channelStakeAfter.should.be.bignumber.greaterThan(channel.stake)  // prove that stak was increased
        channelStakeAfter.should.be.bignumber.equal(minStake)

        // After reaching minStake, stake should not increase anymore and all balance should be settled
        const balanceBefore = await token.balanceOf(consumerChannelAddress)

        await hermes.settleAndRebalance(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const channelStake = (await hermes.channels(channelId)).stake
        channelStake.should.be.bignumber.equal(minStake)  // prove that stake didn't change

        const balanceAfter = await token.balanceOf(consumerChannelAddress)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(minStake))
    })

    it("should be possible to settle into stake", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const channelState = Object.assign({}, { channelId }, channel)
        const amountToPay = new BN('50')
        const transactorFee = new BN('5')
        const transactorBalanceBefore = await token.balanceOf(txMaker)

        // Generate promise and settle into stake
        const promise = generatePromise(amountToPay, transactorFee, channelState, operator, providerA.address)
        await hermes.settleIntoStake(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        // It should have increased stake
        const channelStakeAfter = (await hermes.channels(channelId)).stake
        channelStakeAfter.should.be.bignumber.greaterThan(channel.stake)  // prove that stak was increased
        channelStakeAfter.should.be.bignumber.equal(channel.stake.add(amountToPay))

        // Transactor should get it's fee
        const transactorBalanceAfter = await token.balanceOf(txMaker)
        transactorBalanceAfter.should.be.bignumber.equal(transactorBalanceBefore.add(transactorFee))
    })

    it('should have different stake goals for new and old channel after minStake change', async () => {
        const initialMinStake = (await hermes.getStakeThresholds())[0]
        const newMinStake = new BN('400')

        // Set new stake
        await hermes.setMinStake(newMinStake, { from: operator.address })

        // Register identity and open provider channel by settling promise
        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryB, providerB)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryB, regSignature)
        expect(await registry.isRegistered(providerB.address)).to.be.true

        const channelId = generateChannelId(providerB.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))

        const promise = generatePromise(initialMinStake, Zero, channelState, operator, providerB.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)
        expect(await hermes.isChannelOpened(channelId)).to.be.true

        // Providers should have different stake goals
        const channelA = generateChannelId(providerA.address, hermes.address)
        const channelB = generateChannelId(providerB.address, hermes.address)
        const stakeGoalA = (await hermes.channels(channelA)).stakeGoal
        const stakeGoalB = (await hermes.channels(channelB)).stakeGoal

        stakeGoalA.should.be.bignumber.equal(initialMinStake)
        stakeGoalB.should.be.bignumber.equal(newMinStake)
    })

    it('should set new stake goal', async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const newStakeGoal = new BN('500')
        const nonce = new BN('1')
        const amountToPay = new BN('250')

        const goalUpdateSignature = signStakeGoalUpdate(channelId, newStakeGoal, nonce, providerA)
        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        await hermes.settleWithGoalIncrease(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature, newStakeGoal, nonce, goalUpdateSignature)

        const stakeGoal = (await hermes.channels(channelId)).stakeGoal
        stakeGoal.should.be.bignumber.equal(newStakeGoal)
    })

    it('should take 10% of stake again, until stake goal reached', async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('250')
        const consumerChannelAddress = await registry.getChannelAddress(providerA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.
        const balanceBefore = await token.balanceOf(consumerChannelAddress)

        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        await hermes.settleAndRebalance(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(consumerChannelAddress)
        const amountToSettle = amountToPay.sub(amountToPay.div(new BN(10)))
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToSettle))
    })

})
