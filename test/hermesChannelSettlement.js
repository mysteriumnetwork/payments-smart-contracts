/*
    This test is testing channel creating via settlement. It also tests partial stake increase.
    Tested functions can be found in smart-contract code at `contracts/HermesImplementation.sol`.
*/

const { BN, expectEvent } = require('@openzeppelin/test-helpers')
const { randomBytes } = require('crypto')
const {
    generateChannelId,
    topUpTokens,
    topUpEthers,
    setupDEX
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const {
    signIdentityRegistration,
    signChannelBeneficiaryChange,
    generatePromise
} = require('./utils/client.js')

const MystToken = artifacts.require("TestMystToken")
const HermesImplementation = artifacts.require("TestHermesImplementation")

const ChannelImplementation = artifacts.require("ChannelImplementation")
const Registry = artifacts.require("Registry")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const Five = new BN(5)
const ChainID = 1
const hermesURL = Buffer.from('http://test.hermes')

const operator = wallet.generateAccount(Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex'))  // Generate hermes operator wallet
const providerA = wallet.generateAccount()

const minStake = new BN(25)
const maxStake = new BN(50000)

contract("Channel openinig via settlement tests", ([txMaker, beneficiaryA, beneficiaryB, beneficiaryC, ...otherAccounts]) => {
    let token, hermes, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new()
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, 100, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize hermes hub", async () => {
        await registry.registerHermes(operator.address, 100000, Zero, minStake, maxStake, hermesURL)
        const hermesId = await registry.getHermesAddress(operator.address)
        expect(await registry.isHermes(hermesId)).to.be.true

        // Initialise hermes object
        hermes = await HermesImplementation.at(hermesId)

        // Topup some balance for hermes
        await topUpTokens(token, hermes.address, OneToken)
    })

    it("register consumer identity", async () => {
        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryA, providerA)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryA, regSignature)
        expect(await registry.isRegistered(providerA.address)).to.be.true
    })

    it("should open provider channel while settling promise", async () => {
        const nonce = new BN(1)
        const channelId = await hermes.getChannelId(providerA.address)
        // generateChannelId(providerA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))

        // const R = randomBytes(32)
        // const hashlock = keccak(R)
        const amountToPay = new BN('15')
        const balanceBefore = await token.balanceOf(beneficiaryA)

        // To open channel during settlement we must call `settleWithBeneficiary` instead of `settlePromise`
        const beneficiaryChangeSignature = signChannelBeneficiaryChange(ChainID, registry.address, beneficiaryA, nonce, providerA)
        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        var res = await hermes.settleWithBeneficiary(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature, beneficiaryA, beneficiaryChangeSignature)

        await expectEvent.inTransaction(res.receipt.transactionHash, hermes, 'PromiseSettled', {
            "4":"0x"+promise.lock.toString('hex')
        })

        const balanceAfter = await token.balanceOf(beneficiaryA)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))

        const channelBeneficiary = await registry.getBeneficiary(providerA.address)
        expect(channelBeneficiary).to.be.equal(beneficiaryA)

        expect(await hermes.isChannelOpened(channelId)).to.be.true
    })

    it("settling promises bigger than stake should be handled correctly", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const channelState = Object.assign({}, { channelId }, channel)
        const initialChannelStake = channel.stake
        const amountToPay = new BN('275')

        const balanceBefore = await token.balanceOf(beneficiaryA)

        // Generate and settle promise
        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)
        var res =await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        await expectEvent.inTransaction(res.receipt.transactionHash, hermes, 'PromiseSettled', {
            "4":"0x"+promise.lock.toString('hex')
        })

        // Promise can settle even more than its stake (up to maxStake)
        const balanceAfter = await token.balanceOf(beneficiaryA)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))

        amountToPay.should.be.bignumber.greaterThan(initialChannelStake)
    })

    it("should be possible use same huge promise multiple times untill whole amount is not settled", async () => {
        const channelId = generateChannelId(providerA.address, hermes.address)
        const channel = await hermes.channels(channelId)
        const channelState = Object.assign({}, { channelId }, channel)

        // Generate huge stake
        const amountToPay = maxStake.mul(Five)
        const promise = generatePromise(amountToPay, Zero, channelState, operator, providerA.address)

        // It should be possible to use promise couple of times
        for (let times = 0; times < 5; times++) {
            const balanceBefore = await token.balanceOf(beneficiaryA)

            let res = await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

            await expectEvent.inTransaction(res.receipt.transactionHash, hermes, 'PromiseSettled', {
                "4":"0x"+promise.lock.toString('hex')
            })

            const balanceAfter = await token.balanceOf(beneficiaryA)
            balanceAfter.should.be.bignumber.equal(balanceBefore.add(maxStake))
        }

        // Promise settlement should fail when there is no unsettled tokens anymore
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature).should.be.rejected
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
        var res = await hermes.settleIntoStake(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        await expectEvent.inTransaction(res.receipt.transactionHash, hermes, 'PromiseSettled', {
            "4":"0x"+promise.lock.toString('hex')
        })

        // It should have increased stake
        const channelStakeAfter = (await hermes.channels(channelId)).stake
        channelStakeAfter.should.be.bignumber.greaterThan(channel.stake)  // prove that stak was increased
        channelStakeAfter.should.be.bignumber.equal(channel.stake.add(amountToPay))

        // Transactor should get it's fee
        const transactorBalanceAfter = await token.balanceOf(txMaker)
        transactorBalanceAfter.should.be.bignumber.equal(transactorBalanceBefore.add(transactorFee))
    })
})
