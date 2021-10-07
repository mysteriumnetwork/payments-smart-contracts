require('chai')
    .use(require('chai-as-promised'))
    .should()
const { BN } = require('@openzeppelin/test-helpers')
const { randomBytes } = require('crypto')
const { topUpTokens, generateChannelId, keccak, setupDEX, sleep } = require('./utils/index.js')
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
const ChainID = 1
const hermesURL = Buffer.from('http://test.hermes')

const provider = wallet.generateAccount()
const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')
const hermesOperator = wallet.generateAccount(operatorPrivKey)

contract('Hermes fee', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, channelImplementation, hermes, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new(token.address, hermesOperator.address, 0, OneToken)
        channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, 0, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Topup some tokens into txMaker address so it could register hermes
        await topUpTokens(token, txMaker, 1000)
        await token.approve(registry.address, 1000)
    })

    it('should calculate proper fee righ after hermes registration', async () => {
        // Register hermes
        const hermesFee = 250 // 2.50%
        await registry.registerHermes(hermesOperator.address, 100, hermesFee, 25, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(hermesOperator.address)
        hermes = await HermesImplementation.at(hermesId)

        // Ensure hermes available balance for first settlements
        await topUpTokens(token, hermes.address, OneToken)

        // Fee of settling one token should be 0.025 token
        const oneTokenSettleFee = await hermes.calculateHermesFee(OneToken)
        let fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.025)

        // When settling sumer small values, we'll round fee to avoid calculation errors or value overflow
        const smallValueToSettle = new BN(100)  // 0.000000000000000100 token
        fee = await hermes.calculateHermesFee(smallValueToSettle)
        fee.should.be.bignumber.equal(new BN(3))
    })

    it('should open provider channel', async () => {
        const expectedChannelId = generateChannelId(provider.address, hermes.address)
        const initialHermesBalance = await token.balanceOf(hermes.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(1000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(provider.address, hermes.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, channelStake, Zero, beneficiaries[1], provider)
        await registry.registerIdentity(hermes.address, channelStake, Zero, beneficiaries[1], signature)
        expect(await registry.isRegistered(provider.address)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to hermes
        const hermesTokenBalance = await token.balanceOf(hermes.address)
        hermesTokenBalance.should.be.bignumber.equal(initialHermesBalance.add(channelStake))

        const channel = await hermes.channels(expectedChannelId)
        expect(channel.stake.toNumber()).to.be.equal(channelStake.toNumber())
    })

    it('should properly charge hermes fee', async () => {
        const channelId = generateChannelId(provider.address, hermes.address)
        const amount = new BN(250)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        // Create hermes promise
        const promise = createPromise(ChainID, channelId, amount, Zero, hashlock, hermesOperator)

        // Calculate expected hermes fee
        const fee = await hermes.calculateHermesFee(amount)

        // Settle promise
        const initialHermesBalance = await token.balanceOf(hermes.address)
        const expectedHermesBalance = initialHermesBalance.sub(amount).add(fee)

        await hermes.settlePromise(provider.address, promise.amount, promise.fee, R, promise.signature)

        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.equal(expectedHermesBalance)
    })

    it('should update hermes fee', async () => {
        const initialFee = await hermes.lastFee()
        const newFee = new BN(175) // 1.75%

        await hermes.setHermesFee(newFee, { from: operatorAddress })
        const lastFee = await hermes.lastFee()
        const delayTime = (await web3.eth.getBlock('latest')).timestamp + 2
        lastFee.value.should.be.bignumber.equal(newFee)
        expect(lastFee.validFrom.toNumber()).to.be.equal(delayTime)

        const previousFee = await hermes.previousFee()
        previousFee.value.should.be.bignumber.equal(initialFee.value)
        previousFee.validFrom.should.be.bignumber.equal(initialFee.validFrom)
    })

    it('should still calculate previous fee value untill validFrom block not arrived', async () => {
        const oneTokenSettleFee = await hermes.calculateHermesFee(OneToken)
        let fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.025)
    })

    it('should not allow to update not active last fee', async () => {
        const newFee = new BN(500) // 5%
        await hermes.setHermesFee(newFee, { from: operatorAddress }).should.be.rejected
    })

    it('should calculate new fee after validFrom block is arrived', async () => {
        // Jump over time
        await sleep(2000)
        await hermes.moveBlock()

        const oneTokenSettleFee = await hermes.calculateHermesFee(OneToken)
        fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.0175)
    })

    it('should fail updating hermes fee from not operator account', async () => {
        const newFee = new BN(175) // 1.75%
        await hermes.setHermesFee(newFee).should.be.rejected
    })

    it('fee can not be bigger that 50%', async () => {
        const newFee = new BN(5001) // 50.01%
        await hermes.setHermesFee(newFee, { from: operatorAddress }).should.be.rejected
    })

})