require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')

const { topUpTokens, generateChannelId, keccak, setupConfig } = require('./utils/index.js')
const {
    signIdentityRegistration,
    createPromise
} = require('./utils/client.js')
const wallet = require('./utils/wallet.js')


const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("TestAccountantImplementation")
const ChannelImplementationProxy = artifacts.require("ChannelImplementationProxy")

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
        const accountantImplementation = await AccountantImplementation.new(token.address, accountantOperator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementationProxy.new()
        const config = await setupConfig(txMaker, channelImplementation.address, accountantImplementation.address)
        registry = await Registry.new(token.address, dex.address, config.address, Zero, stake)

        // Topup some tokens into txMaker address so it could register accountant
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it('should reject accountant registration if he do not pay enought stake', async () => {
        const stateAmount = stake - 1
        await registry.registerAccountant(accountantOperator.address, stateAmount, Zero, OneToken).should.be.rejected
    })

    it('should register accountant when stake is ok', async () => {
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
        expect(await accountant.isChannelOpened(expectedChannelId)).to.be.true

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

        await accountant.settlePromise(provider.address, promise.amount, promise.fee, R, promise.signature)

        const channelBalance = (await accountant.channels(channelId)).balance
        channelBalance.should.be.bignumber.equal(expectedChannelBalance)
    })

    it('should rebalance channel only with available balance and enable punishment mode', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const channel = await accountant.channels(channelId)
        const rebalanceAmount = channel.stake.sub(channel.balance)

        // Make accountant available balance to be half of needed
        await topUpTokens(token, accountant.address, rebalanceAmount / 2)

        // Rebalance channel
        await accountant.rebalanceChannel(channelId)


        // There should be zoro available balance
        expect((await accountant.availableBalance()).toNumber()).to.be.equal(0)

        // Because of not getting all expected balance, there should be enabled punishment mode
        const accountantStatus = await accountant.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(accountantStatus.toNumber()).to.be.equal(2)
        expect(await accountant.isAccountantActive()).to.be.false
    })

    it('accountant stake should remain untouched', async () => {
        const accountantStake = await accountant.getStake()
        accountantStake.should.be.bignumber.equal(stake)

        const accountantBalance = await token.balanceOf(accountant.address)
        accountantBalance.should.be.bignumber.least(await accountant.minimalExpectedBalance())
    })

})
