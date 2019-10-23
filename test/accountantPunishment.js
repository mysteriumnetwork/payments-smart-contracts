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
const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const accountantOperator = wallet.generateAccount(operatorPrivKey)

contract('Accountant punishment', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, accountant, registry, stake
    before(async () => {
        stake = OneToken

        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new(token.address, accountantOperator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, Zero, stake)

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

    it('should rebalance channel only with available abalance and enable punishment mode', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const channel = await accountant.channels(channelId)
        const rebalanceAmount = channel.loan.sub(channel.balance)
        const initialStake = await accountant.getStake()

        // Make accountant available balance to be half of needed
        await topUpTokens(token, accountant.address, rebalanceAmount / 2)

        // Rebalance channel
        await accountant.rebalanceChannel(channelId)

        // Stake should remain untouched
        const accountantStake = await accountant.getStake()
        expect(accountantStake.toNumber()).to.be.equal(initialStake.toNumber())

        // There should be zoro available balance
        expect((await accountant.availableBalance()).toNumber()).to.be.equal(0)

        // Because of not getting all expected balance, there should be enabled punishment mode
        const accountantStatus = await accountant.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(accountantStatus.toNumber()).to.be.equal(2)
        expect(await accountant.isAccountantActive()).to.be.false
    })

    it('should not allow to register new identity with accountant in punishment mode', async () => {
        const newProvider = wallet.generateAccount()
        const channelStake = new BN(1000)

        // Ensure that accountant is in punishment mode
        const accountantStatus = await accountant.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(accountantStatus.toNumber()).to.be.equal(2)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(newProvider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Registering any kind of identity with accountant should fail
        let signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[1], signature).should.be.rejected

        signature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaries[1], signature).should.be.rejected
    })

    it('should still allow to increase channel loan', async () => {
        const amountToLend = new BN('1500')
        const channelId = generateChannelId(provider.address, accountant.address)
        const initialChannelLoan = (await accountant.channels(channelId)).loan

        // txMaker should have enought tokens
        await topUpTokens(token, txMaker, amountToLend)
        await token.approve(accountant.address, amountToLend)

        // Should increase channel loan
        await accountant.increaseLoan(channelId, amountToLend)

        const channel = await accountant.channels(channelId)
        channel.loan.should.be.bignumber.equal(initialChannelLoan.add(amountToLend))
        channel.balance.should.be.bignumber.equal(initialChannelLoan.add(amountToLend))
    })

    it('provider should be able to get his loan back (at least part of it)', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const channelLoanAmount = (await accountant.channels(channelId)).loan
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaries[0])

        const nonce = new BN(1)
        const signature = signChannelLoanReturnRequest(channelId, channelLoanAmount, nonce, provider)
        await accountant.decreaseLoan(channelId, channelLoanAmount, nonce, signature)

        const channel = await accountant.channels(channelId)
        const beneficiaryBalance = await token.balanceOf(beneficiaries[0])
        initialBeneficiaryBalance.should.be.bignumber.lessThan(beneficiaryBalance)
        channel.loan.should.be.bignumber.lessThan(channelLoanAmount)
    })

    it('accountant operator should not be able to update channel balance', async () => {
        const newBalance = new BN('10')
        await topUpTokens(token, txMaker, newBalance)
        
        const channelId = generateChannelId(provider.address, accountant.address)
        await accountant.updateChannelBalance(channelId, newBalance, {from: operatorAddress}).should.be.rejected
    })

    it('should fail resolving emergency when txMaker balance is not enough', async () => {
        await accountant.resolveEmergency().should.be.rejected
    })

    it('should successfully resolve emergency', async () => {
        const initialPunishmentAmount = (await accountant.punishment()).amount

        // Ensure txMaker to have enough tokens to resolve emergency
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(accountant.address, OneToken)

        await accountant.resolveEmergency()

        const accountantStatus = await accountant.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(accountantStatus.toNumber()).to.be.equal(0)

        // Because emergency was resolved in one hour, punishment amount should be not increased
        const punishmentAmount = (await accountant.punishment()).amount
        punishmentAmount.should.be.bignumber.equal(initialPunishmentAmount)
    })

    it('should fail calling resolveEmergency() when not in punishment mode', async () => {
        expect(await accountant.isAccountantActive()).to.be.true
        await accountant.resolveEmergency().should.be.rejected
    })

    it('should all back to normal',  async () => {
        // Should allow to register new identity
        const newProvider = wallet.generateAccount()
        const channelStake = new BN(1000)
        
        const channelAddress = await registry.getChannelAddress(newProvider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)
        
        let signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[1], newProvider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[1], signature)
        
        // Should fully rebalance channel
        const channelId = generateChannelId(provider.address, accountant.address)
        await accountant.rebalanceChannel(channelId)
        let channel = await accountant.channels(channelId)
        channel.balance.should.be.bignumber.equal(channel.loan)

        // Operator should be able to update channel balance
        const newBalance = new BN(70000)
        await topUpTokens(token, accountant.address, newBalance)
        await accountant.updateChannelBalance(channelId, newBalance, {from: operatorAddress})
        channel = await accountant.channels(channelId)
        channel.balance.should.be.bignumber.equal(newBalance)
        
        expect(await accountant.isAccountantActive()).to.be.true
    })
})

// TODO add tests when emergency not resolved on time