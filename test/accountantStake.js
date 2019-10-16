require('chai')
.use(require('chai-as-promised'))
.should()
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')

const { topUpTokens, generateChannelId, keccak } = require('./utils/index.js')
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

const provider = wallet.generateAccount()
const accountantOperator = wallet.generateAccount()

contract('Accountant stake', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, accountant, registry, stake
    before(async () => {
        stake = OneToken

        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new(token.address, accountantOperator.address, 0)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, Zero, stake)

        // Topup some tokens into txMaker address so it could register accountant
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it('should reject accountant registration if he do not pay enought stake', async () => {
        const stateAmount = stake - 1
        await registry.registerAccountant(accountantOperator.address, stateAmount, Zero).should.be.rejected
    })

    it('should register accountant when stake is ok', async () => {
        await registry.registerAccountant(accountantOperator.address, stake, Zero)
        const accountantId = await registry.getAccountantAddress(accountantOperator.address)
        accountant = await AccountantImplementation.at(accountantId)
        expect(await registry.isActiveAccountant(accountant.address)).to.be.true
    })

    it('should open provider channel and calculate zero available balance', async () => {
        const expectedChannelId = generateChannelId(provider.address, accountant.address)
        const initialAccountantBalance = await token.balanceOf(accountant.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(1000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(provider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[0], provider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[0], signature)
        expect(await registry.isRegistered(provider.address)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to accountant
        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(initialAccountantBalance.add(channelStake))

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())

        // Accountant should still not have available balance
        const availableBalance = await accountant.availableBalance()
        availableBalance.should.be.bignumber.equal(Zero)
    })


    it('should settle promise and decrease channel balance', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const amount = new BN(250)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        // Create accountant promise
        const promise = createPromise(channelId, amount, Zero, hashlock, accountantOperator)

        // Settle promise
        const initialChannelBalance = (await accountant.channels(channelId)).balance
        const expectedChannelBalance = initialChannelBalance.sub(amount)

        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, R, promise.signature)

        const channelBalance = (await accountant.channels(channelId)).balance
        channelBalance.should.be.bignumber.equal(expectedChannelBalance)
    })

    it('should rebalance channel and get missing tokens from stake', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const channel = await accountant.channels(channelId)
        const rebalanceAmount = channel.loan.sub(channel.balance)
        const initialStake = await accountant.getStake()

        // Make accountant available balance to be half of needed
        await topUpTokens(token, accountant.address, rebalanceAmount / 2)
        expect((await accountant.availableBalance()).toNumber()).to.be.equal(rebalanceAmount / 2)

        // Rebalance channel and make sure that stake was decreased
        await accountant.rebalanceChannel(channelId)
        const rebalancedChannel = await accountant.channels(channelId)
        rebalancedChannel.balance.should.be.bignumber.equal(rebalancedChannel.loan)

        const accountantStake = await accountant.getStake()
        expect(accountantStake.toNumber()).to.be.equal(initialStake - rebalanceAmount / 2)
        expect((await accountant.availableBalance()).toNumber()).to.be.equal(0)
    })

    it('should not allow to open new provider channel because there is not enough accountant stake', async () => {
        const newProvider = wallet.generateAccount()
        const providerChannelId = generateChannelId(newProvider.address, accountant.address)
        const channelStake = new BN(1000)
        
        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(newProvider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Register identity and open channel with accountant
        let signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[1], signature).should.be.rejected

        // Opening zero loan channel should be still possible
        signature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaries[1], signature)
        expect(await registry.isRegistered(newProvider.address)).to.be.true
        expect(await accountant.isOpened(providerChannelId)).to.be.true

        const channel = await accountant.channels(providerChannelId)
        channel.loan.should.be.bignumber.equal(Zero)
        channel.balance.should.be.bignumber.equal(Zero)
    })

    it('should fail increasing channel loan', async () => {
        const amountToLend = new BN('1500')
        const channelId = generateChannelId(provider.address, accountant.address)

        // txMaker should have enought tokens
        await topUpTokens(token, txMaker, amountToLend)
        await token.approve(accountant.address, amountToLend)

        // Should fail increasing channel loan
        await accountant.increaseLoan(channelId, amountToLend).should.be.rejected

        // zero loan channel should also fail inreasing his loan
        const newProvider = wallet.generateAccount()
        const signature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaries[1], signature)
        expect(await registry.isRegistered(newProvider.address)).to.be.true
        await accountant.increaseLoan(channelId, amountToLend).should.be.rejected
    })

    it('provider should be able to get his loan back', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const channelLoanAmount = (await accountant.channels(channelId)).loan
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaries[0])

        const nonce = new BN(1)
        const signature = signChannelLoanReturnRequest(channelId, nonce, provider)
        await accountant.requestLoanReturn(provider.address, nonce, signature)

        // Jump over a few blocks
        for (let i=0; i<4; i++) {
            await accountant.moveBlock()
        }

        await accountant.finalizeLoanReturn(channelId)
        const channel = await accountant.channels(channelId)
        
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(channelLoanAmount))
        channel.loan.should.be.bignumber.equal(Zero)
    })

    it('accountant operator should not be able to update channel balance', async () => {
        const newBalance = new BN('10')
        await topUpTokens(token, txMaker, newBalance)
        
        const channelId = generateChannelId(provider.address, accountant.address)
        const nonce = new BN(1)
        const signature = signChannelBalanceUpdate(channelId, nonce, newBalance, accountantOperator)
        await accountant.updateChannelBalance(channelId, nonce, newBalance, signature).should.be.rejected
    })

    it('should be possible to increase accountant stake', async () => {
        const missingStake = stake.sub(await accountant.getStake())

        await topUpTokens(token, accountant.address, missingStake)
        let availableBalance = await accountant.availableBalance()
        availableBalance.should.be.bignumber.equal(missingStake)

        await accountant.increaseStake(missingStake)
        const accountantStake = await accountant.getStake()
        accountantStake.should.be.bignumber.equal(stake)
        availableBalance = await accountant.availableBalance()
        availableBalance.should.be.bignumber.equal(Zero)
    })

    it('everyting should back to normal after updating accountant stake until minimal amount', async () => {
        // Should be possible to register new provider with loan
        const newProvider = wallet.generateAccount()
        const providerChannelId = generateChannelId(newProvider.address, accountant.address)
        const channelStake = new BN(1000)
        
        const channelAddress = await registry.getChannelAddress(newProvider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)

        let signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[1], signature)
        expect(await registry.isRegistered(newProvider.address)).to.be.true
        expect(await accountant.isOpened(providerChannelId)).to.be.true

        const channel = await accountant.channels(providerChannelId)
        channel.loan.should.be.bignumber.equal(channelStake)
        channel.balance.should.be.bignumber.equal(channelStake)

        // Should be possible to increase channel loan
        const amountToLend = new BN('1500')
        const provider2ChannelId = generateChannelId(provider.address, accountant.address)

        await topUpTokens(token, txMaker, amountToLend)
        await token.addApproval(accountant.address, amountToLend)

        await accountant.increaseLoan(provider2ChannelId, amountToLend)
        const channel2 = await accountant.channels(provider2ChannelId)
        channel2.loan.should.be.bignumber.equal(amountToLend)
        channel2.balance.should.be.bignumber.equal(amountToLend)

        // Accountant operator should be able to update channel balance
        const newBalance = new BN('10000')
        await topUpTokens(token, accountant.address, newBalance)
        const availableBalance = await accountant.availableBalance()
        availableBalance.should.be.bignumber.equal(newBalance)

        const nonce = new BN(1)
        const sig = signChannelBalanceUpdate(provider2ChannelId, nonce, newBalance, accountantOperator)
        await accountant.updateChannelBalance(provider2ChannelId, nonce, newBalance, sig)
        const updatedChannel = await accountant.channels(provider2ChannelId)
        updatedChannel.balance.should.be.bignumber.equal(newBalance)
    })
})
