/*
    This test is checking correctness of operations with channel stake.
    Tested functions can be found in smart-contract code at `contracts/HermesImplementation.sol`.
*/

const { BN } = require('web3-utils');
const {
    generateChannelId,
    topUpTokens,
    topUpEthers,
    setupDEX
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const {
    signIdentityRegistration,
    signChannelLoanReturnRequest,
    generatePromise
} = require('./utils/client.js')
const { assertEvent } = require('./utils/tests.js')
const { expect } = require('chai')

const MystToken = artifacts.require("TestMystToken")
const HermesImplementation = artifacts.require("TestHermesImplementation")

const ChannelImplementation = artifacts.require("ChannelImplementation")
const Registry = artifacts.require("Registry")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const One = new BN(1)
const hermesURL = Buffer.from('http://test.hermes')

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')

const minStake = new BN(25)
const maxStake = new BN(50000)
const hermesStake = new BN(100000)

contract.only("Channel stake tests", ([txMaker, beneficiaryA, beneficiaryB, beneficiaryC, ...otherAccounts]) => {
    const operator = wallet.generateAccount(operatorPrivKey)
    const providerA = wallet.generateAccount()
    const providerB = wallet.generateAccount()
    const providerC = wallet.generateAccount()

    let token, hermes, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new()
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, hermesStake, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and staking
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize hermes", async () => {
        await registry.registerHermes(operator.address, hermesStake, Zero, minStake, maxStake, hermesURL)
        const hermesId = await registry.getHermesAddress(operator.address)
        expect(await registry.isHermes(hermesId)).to.be.true

        // Initialise hermes object
        hermes = await HermesImplementation.at(hermesId)

        // Topup some balance for hermes
        await topUpTokens(token, hermes.address, OneToken)
    })

    it("should reject opening provider channel with not enough stake", async () => {
        const expectedChannelId = generateChannelId(providerA.address, hermes.address)
        const stakeAmount = minStake.sub(One);  // one token less than min stake

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(providerA.address, hermes.address)
        await token.mint(channelAddress, stakeAmount)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(stakeAmount.toNumber())

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, stakeAmount, Zero, beneficiaryA, providerA)
        await registry.registerIdentity(hermes.address, stakeAmount, Zero, beneficiaryA, signature).should.be.rejected

        expect(await registry.isRegistered(providerA.address)).to.be.false
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.false
    })

    it("should properly open channel with hermes", async () => {
        const expectedChannelId = generateChannelId(providerA.address, hermes.address)
        const stakeAmount = minStake

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(providerA.address, hermes.address)
        await token.mint(channelAddress, stakeAmount)

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, stakeAmount, Zero, beneficiaryA, providerA)
        await registry.registerIdentity(hermes.address, stakeAmount, Zero, beneficiaryA, signature)

        expect(await registry.isRegistered(providerA.address)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true
    })

    it("should be possible to settle promise", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryA)

        promise = generatePromise(amountToPay, Zero, channelState, operator)
        await hermes.settlePromise(providerA.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryA)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))
    })

    it("should fail settling promise on channel with zero stake", async () => {
        // Register identity with zero stake
        const channelId = generateChannelId(providerB.address, hermes.address)

        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryB, providerB)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryB, regSignature)

        expect(await registry.isRegistered(providerB.address)).to.be.true
        expect(await hermes.isChannelOpened(channelId)).to.be.false

        // Try settling issued promise
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryB)

        promise = generatePromise(amountToPay, Zero, channelState, operator)
        await hermes.settlePromise(providerB.address, promise.amount, promise.fee, promise.lock, promise.signature).should.be.rejected

        balanceBefore.should.be.bignumber.equal(await token.balanceOf(beneficiaryB))
    })

    it("should fail adding not enough stake", async () => {
        const channelId = generateChannelId(providerB.address, hermes.address)
        const stakeAmount = minStake.sub(One)

        await token.approve(hermes.address, minStake)
        await hermes.increaseStake(channelId, stakeAmount).should.be.rejected
    })

    it("should properly settle after increasing stake", async () => {
        // Increase channel stake
        const channelId = generateChannelId(providerB.address, hermes.address)
        const stakeAmount = minStake

        await token.approve(hermes.address, stakeAmount)
        await hermes.increaseStake(channelId, stakeAmount)

        const channel = await hermes.channels(channelId)
        expect(channel.stake.toNumber()).to.be.equal(stakeAmount.toNumber())

        // Settle promise
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryB)

        promise = generatePromise(amountToPay, Zero, channelState, operator)
        await hermes.settlePromise(providerB.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryB)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))

        const settledAmount = (await hermes.channels(channelId)).settled.toNumber()
        expect(settledAmount).to.be.equal(amountToPay.toNumber())
    })

    it("should fail decreasing stake into lower than minStake", async () => {
        const channelId = generateChannelId(providerB.address, hermes.address)
        const channel = await hermes.channels(channelId)

        const nonce = channel.lastUsedNonce.add(One)
        const signature = signChannelLoanReturnRequest(channelId, One, Zero, nonce, providerB)

        await hermes.decreaseStake(providerB.address, One, Zero, signature).should.be.rejected

        const channelStake = (await hermes.channels(channelId)).stake.toNumber()
        expect(channelStake).to.be.equal(channel.stake.toNumber())
    })

    it("should decrease stake into zero even when minStake is set", async () => {
        const channelId = generateChannelId(providerB.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const initialChannelStake = channel.stake
        const initialBalance = await token.balanceOf(beneficiaryB)

        const nonce = channel.lastUsedNonce.add(One)
        const signature = signChannelLoanReturnRequest(channelId, initialChannelStake, Zero, nonce, providerB)

        await hermes.decreaseStake(providerB.address, initialChannelStake, Zero, signature)

        const channelStake = (await hermes.channels(channelId)).stake.toNumber()
        expect(channelStake).to.be.equal(0)

        const beneficiaryBalance = await token.balanceOf(beneficiaryB)
        beneficiaryBalance.should.be.bignumber.equal(initialBalance.add(initialChannelStake))
    })

    it("should allow settle into stake to increase channel stake", async () => {
        // Register identity with zero stake
        const channelId = generateChannelId(providerC.address, hermes.address)

        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryC, providerC)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryC, regSignature)

        expect(await registry.isRegistered(providerC.address)).to.be.true
        expect(await hermes.isChannelOpened(channelId)).to.be.false

        // Increase channel stake via promise settlement
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = minStake

        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerC.address)
        await hermes.settleIntoStake(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const channelStake = (await hermes.channels(channelId)).stake
        channelStake.should.be.bignumber.equal(amountToPay)
    })
})
