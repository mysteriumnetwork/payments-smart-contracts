require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')
const { randomBytes } = require('crypto')

const { topUpTokens, setupDEX, generateChannelId, keccak } = require('./utils/index.js')
const {
    signIdentityRegistration,
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

const provider = wallet.generateAccount()
const hermesOperator = wallet.generateAccount()

contract('Hermes stake management', ([txMaker, operatorAddress, ...beneficiaries]) => {
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
        const promise = createPromise(channelId, amount, Zero, hashlock, hermesOperator)

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

        // Make hermes available balance to be half of needed
        await topUpTokens(token, hermes.address, rebalanceAmount / 2)

        // Rebalance channel
        await hermes.rebalanceChannel(channelId)


        // There should be zoro available balance
        expect((await hermes.availableBalance()).toNumber()).to.be.equal(0)

        // Because of not getting all expected balance, there should be enabled punishment mode
        const hermesStatus = await hermes.getStatus() // 0 - Active, 1 - Paused, 2 - Punishment, 3 - Closed
        expect(hermesStatus.toNumber()).to.be.equal(2)
        expect(await hermes.isHermesActive()).to.be.false
    })

    it('hermes stake should remain untouched', async () => {
        const hermesStake = await hermes.getHermesStake()
        hermesStake.should.be.bignumber.equal(stake)

        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.least(await hermes.minimalExpectedBalance())
    })

})
