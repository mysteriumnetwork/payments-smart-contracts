/*
    This test is testing uni-directional, promise based herms hub payment multi channel implementation.
    Smart-contract code can be found in `contracts/HermesImplementation.sol`.
*/

const { BN } = require('@openzeppelin/test-helpers')
const {
    generateChannelId,
    topUpTokens,
    topUpEthers,
    setupConfig
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const {
    signChannelBeneficiaryChange,
    signChannelLoanReturnRequest,
    signIdentityRegistration,
    generatePromise
} = require('./utils/client.js')

const MystToken = artifacts.require("TestMystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("TestHermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ZeroAddress = '0x0000000000000000000000000000000000000000'
const hermesURL = Buffer.from('http://test.hermes')

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')

contract('Hermes Contract Implementation tests', ([txMaker, operatorAddress, beneficiaryA, beneficiaryB, beneficiaryC, beneficiaryD, ...otherAccounts]) => {
    const operator = wallet.generateAccount(operatorPrivKey)
    const identityA = wallet.generateAccount()
    const identityB = wallet.generateAccount()
    const identityC = wallet.generateAccount()
    const identityD = wallet.generateAccount()

    let token, hermes, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const hermesImplementation = await HermesImplementation.new(token.address, operator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, 1, channelImplementation.address, hermesImplementation.address, ZeroAddress)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize hermes", async () => {
        await registry.registerHermes(operator.address, 10, 0, 25, OneToken, hermesURL)
        const hermesId = await registry.getHermesAddress(operator.address)
        expect(await registry.isHermes(hermesId)).to.be.true

        // Initialise hermes object
        hermes = await HermesImplementation.at(hermesId)

        // Topup some balance for hermes
        topUpTokens(token, hermes.address, new BN(100000))
    })

    it("already initialized hermes should reject initialization request", async () => {
        expect(await hermes.isInitialized()).to.be.true
        await hermes.initialize(token.address, operator.address).should.be.rejected
    })

    /**
     * Testing channel opening functionality
     */

    it('should use proper channelId format', async () => {
        const expectedChannelId = generateChannelId(identityA.address, hermes.address)
        const channelId = await hermes.getChannelId(identityA.address)
        expect(channelId).to.be.equal(expectedChannelId)
    })

    it("registered identity with zero stake should not have hermes channel", async () => {
        const regSignature = signIdentityRegistration(registry.address, hermes.address, Zero, Zero, beneficiaryA, identityA)
        await registry.registerIdentity(hermes.address, Zero, Zero, beneficiaryA, regSignature)
        expect(await registry.isRegistered(identityA.address)).to.be.true

        const expectedChannelId = generateChannelId(identityA.address, hermes.address)
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.false
    })

    it("should still be possible to settle promise even when there is zero stake", async () => {
        const channelId = generateChannelId(identityA.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const consumerChannelAddress = await registry.getChannelAddress(identityA.address, hermes.address)  // User's topup channes is used as beneficiary when channel opening during settlement is used.
        const amountToPay = new BN('25')
        const balanceBefore = await token.balanceOf(consumerChannelAddress)

        promise = generatePromise(amountToPay, Zero, channelState, operator, identityA.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(consumerChannelAddress)
        const amountToSettle = amountToPay.sub(amountToPay.div(new BN(10))) // amountToPay - 10% which will be used as stake
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToSettle))
    })

    it("should be possible to open channel during registering identity into registry", async () => {
        const initialHermesBalance = await token.balanceOf(hermes.address)
        const expectedChannelId = generateChannelId(identityB.address, hermes.address)
        const amountToLend = new BN(777)

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(identityB.address, hermes.address)
        await token.mint(channelAddress, amountToLend)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(amountToLend.toNumber())

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, amountToLend, Zero, beneficiaryB, identityB)
        await registry.registerIdentity(hermes.address, amountToLend, Zero, beneficiaryB, signature)
        expect(await registry.isRegistered(identityB.address)).to.be.true
        expect(await hermes.isChannelOpened(expectedChannelId)).to.be.true

        // Tokens to lend should be transfered from channel address to hermes contract
        const channelBalance = await token.balanceOf(channelAddress)
        channelBalance.should.be.bignumber.equal(Zero)

        const hermesTokenBalance = await token.balanceOf(hermes.address)
        hermesTokenBalance.should.be.bignumber.equal(initialHermesBalance.add(amountToLend))

        // Channel have to be opened with proper state
        const channel = await hermes.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryB)
        expect(channel.balance.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.stake.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.lastUsedNonce.toNumber()).to.be.equal(0)

        // Hermes available (not locked in any channel) funds should be not incresed
        const availableBalance = await hermes.availableBalance()
        expect(availableBalance.toNumber()).to.be.equal(99975) // Equal to initial balance
    })

    /**
     * Testing promise settlement functionality
     */

    it("should be possible to settle promise issued by hermes", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryB)

        promise = generatePromise(amountToPay, new BN(0), channelState, operator)
        await hermes.settlePromise(identityB.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryB)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))
    })

    it("should fail while settling same promise second time", async () => {
        await hermes.settlePromise(identityB.address,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.signature).should.be.rejected
    })

    it("should fail settling promise signed by wrong operator", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')

        const promise = generatePromise(amountToPay, new BN(0), channelState, identityB)
        await hermes.settlePromise(
            identityB.address,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.signature).should.be.rejected
    })

    it("should send fee for transaction maker", async () => {
        // TopUp channel -> send or mint tokens into channel address
        const channelId = generateChannelId(identityC.address, hermes.address)
        const topupChannelAddress = await registry.getChannelAddress(identityC.address, hermes.address)
        const amountToLend = new BN(888)
        await token.mint(topupChannelAddress, amountToLend)
        expect(Number(await token.balanceOf(topupChannelAddress))).to.be.equal(amountToLend.toNumber())

        // Register identity and open channel with hermes
        const signature = signIdentityRegistration(registry.address, hermes.address, amountToLend, Zero, beneficiaryC, identityC)
        await registry.registerIdentity(hermes.address, amountToLend, Zero, beneficiaryC, signature)
        expect(await registry.isRegistered(identityC.address)).to.be.true
        expect(await hermes.isChannelOpened(channelId)).to.be.true

        // Send transaction
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const fee = new BN('7')

        const beneficiaryBalanceBefore = await token.balanceOf(beneficiaryC)
        const txMakerBalanceBefore = await token.balanceOf(txMaker)

        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalanceAfter = await token.balanceOf(beneficiaryC)
        beneficiaryBalanceAfter.should.be.bignumber.equal(beneficiaryBalanceBefore.add(amountToPay))

        const txMakerBalanceAfter = await token.balanceOf(txMaker)
        txMakerBalanceAfter.should.be.bignumber.equal(txMakerBalanceBefore.add(fee))
    })

    it("should settle as much as it can when promise is bigger than channel balance", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('1000')
        const fee = new BN('0')

        promise = generatePromise(amountToPay, fee, channelState, operator)
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('881') // initial balance of 888 - 7 tokens paid for tx maker
    })

    it("should settle rest of promise amount after channel rebalance", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelBalance = (await hermes.channels(channelId)).balance.toNumber()

        // Rebalance channel
        expect(channelBalance).to.be.equal(0)
        await hermes.rebalanceChannel(channelId)
        const channelBalanceAfter = (await hermes.channels(channelId)).balance.toNumber()
        expect(channelBalanceAfter).to.be.equal(888)

        // Settle previous promise to get rest of promised coins
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)
        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('1100')  // Two previous promises of 100 + 1000
    })

    /**
     * Testing channel rebalance and stake management functionality
     */

    it("hermes operator can make increase channel balance to settle bigger promises", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const newBalance = new BN('10000')
        await hermes.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // Channel balance should be incresed
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        channelState.balance.should.be.bignumber.equal(newBalance)

        // Hermes available (not locked in any channel) funds should not include stake and funds locked in channel
        const lockedFunds = await hermes.getLockedFunds()
        const stake = await hermes.getHermesStake()
        const expectedBalance = (await token.balanceOf(hermes.address)).sub(stake).sub(lockedFunds)
        const availableBalance = await hermes.availableBalance()
        expect(availableBalance.toNumber()).to.be.equal(expectedBalance.toNumber())

        // Settle big promise
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)
        const amountToPay = new BN('5000')
        const fee = new BN('0')
        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(amountToPay))
    })

    it("should fail updating channel balance increase done by not operator", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const newBalance = new BN('20000')
        await hermes.updateChannelBalance(channelId, newBalance).should.be.rejected
    })

    it("should not rebalance when channel's balance is bigger than stake size", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        await hermes.rebalanceChannel(channelId).should.be.rejected
    })

    it("hermes operator should still be able to reduce channel's balance", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelInitialBalace = (await hermes.channels(channelId)).balance
        const hermesInitialAvailableBalace = await hermes.availableBalance()

        const newBalance = new BN('1000')
        await hermes.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // It should enable waiting period for channel balance reduction
        let channel = await hermes.channels(channelId)
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        expect(channel.timelock.toNumber()).to.be.equal(expectedBlockNumber)
        channel.balance.should.be.bignumber.equal(channelInitialBalace)

        // Move some blocks
        for (let i = 0; i < 4; i++) {
            await hermes.moveBlock()
        }

        await hermes.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // Channel balance should be decreased
        const channelBalance = (await hermes.channels(channelId)).balance
        channelBalance.should.be.bignumber.lessThan(channelInitialBalace)
        channelBalance.should.be.bignumber.equal(newBalance)

        // Hermes' available balance have to be increased
        const hermesAvailableBalance = await hermes.availableBalance()
        hermesAvailableBalance.should.be.bignumber.greaterThan(hermesInitialAvailableBalace)

        const channelBalanceDifference = channelInitialBalace.sub(newBalance)
        hermesAvailableBalance.should.be.bignumber.equal(hermesInitialAvailableBalace.add(channelBalanceDifference))
    })

    it("hermes operator should be not able to reduce channel's balance below stake size", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const newBalance = new BN('10')
        await hermes.updateChannelBalance(channelId, newBalance).should.be.rejected
    })

    it("party should be able to increase stake", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const channelInitialState = await hermes.channels(channelId)
        const hermesInitialBalance = await token.balanceOf(hermes.address)
        const hermesInitialAvailableBalace = await hermes.availableBalance()
        const initialBalanceLoanDiff = channelInitialState.stake.sub(channelInitialState.balance)
        const amountToLend = new BN('1500')

        // Increase stake
        await token.approve(hermes.address, amountToLend)
        await hermes.increaseStake(channelId, amountToLend)

        const channelStake = await hermes.channels(channelId)
        channelStake.stake.should.be.bignumber.equal(channelInitialState.stake.add(amountToLend))
        channelStake.balance.should.be.bignumber.equal(channelInitialState.stake.add(amountToLend))

        // Tokens should be properly transfered into hermes smart contract address
        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.equal(hermesInitialBalance.add(amountToLend))

        // hermes abailable balance should be calculated properly
        const hermesAvailableBalance = await hermes.availableBalance()

        hermesAvailableBalance.should.be.bignumber.equal(hermesInitialAvailableBalace.sub(initialBalanceLoanDiff))
    })

    it("party should be able to change beneficiary", async () => {
        const newBeneficiary = otherAccounts[0]
        const channelId = generateChannelId(identityB.address, hermes.address)
        const nonce = new BN(3)
        const signature = signChannelBeneficiaryChange(channelId, newBeneficiary, nonce, identityB)

        await hermes.setBeneficiary(channelId, newBeneficiary, nonce, signature)

        expect((await hermes.channels(channelId)).beneficiary).to.be.equal(newBeneficiary)
    })

    it("should be possible to get stake back", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const initialChannelState = await hermes.channels(channelId)
        const hermesInitialAvailableBalace = await hermes.availableBalance()

        const nonce = new BN(4)
        const amount = initialChannelState.stake
        const signature = signChannelLoanReturnRequest(channelId, amount, Zero, nonce, identityB)

        await hermes.decreaseStake(channelId, amount, Zero, nonce, signature)
        const beneficiaryBalance = await token.balanceOf(otherAccounts[0])
        beneficiaryBalance.should.be.bignumber.equal(initialChannelState.stake)

        const channel = await hermes.channels(channelId)
        expect(channel.stake.toNumber()).to.be.equal(0)
        expect(channel.balance.toNumber()).to.be.equal(0)

        // Available balance should be not changed because of getting channel's balance back available
        expect((await hermes.availableBalance()).toNumber()).to.be.equal(hermesInitialAvailableBalace.toNumber())
    })

    it("should handle huge channel stakes", async () => {
        const channelId = generateChannelId(identityD.address, hermes.address)
        const amountToLend = OneToken

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(identityD.address, hermes.address)
        await topUpTokens(token, channelAddress, amountToLend)

        // Register identity and open channel with hermes
        let signature = signIdentityRegistration(registry.address, hermes.address, amountToLend, Zero, beneficiaryD, identityD)
        await registry.registerIdentity(hermes.address, amountToLend, Zero, beneficiaryD, signature)
        expect(await registry.isRegistered(identityD.address)).to.be.true
        expect(await hermes.isChannelOpened(channelId)).to.be.true

        // Settle all you can
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const promise = generatePromise(amountToLend, new BN(0), channelState, operator)
        await hermes.settlePromise(identityD.address, promise.amount, promise.fee, promise.lock, promise.signature)

        // Ensure that amountToLend is bigger than stake + locked in channels funds
        let minimalExpectedBalance = await hermes.minimalExpectedBalance()
        expect(minimalExpectedBalance.toNumber()).to.be.below(amountToLend.toNumber())

        // Try getting stake back
        const currentBalance = await token.balanceOf(hermes.address)
        const nonce = new BN(5)
        signature = signChannelLoanReturnRequest(channelId, amountToLend, Zero, nonce, identityD)
        await hermes.decreaseStake(channelId, amountToLend, Zero, nonce, signature)

        minimalExpectedBalance = await hermes.minimalExpectedBalance()
        const availableToUse = currentBalance.sub(minimalExpectedBalance)
        const channel = await hermes.channels(channelId)
        expect(channel.stake.toNumber()).to.be.equal(amountToLend.sub(availableToUse).toNumber())
        expect(channel.balance.toNumber()).to.be.equal(0)

        // Hermes should become not active
        expect(await hermes.isHermesActive()).to.be.false
    })

    it("should resolve emergency", async () => {
        await topUpTokens(token, hermes.address, OneToken)
        await hermes.resolveEmergency()
        expect(await hermes.isHermesActive()).to.be.true
    })

    /**
     * Testing hermes's funds withdrawal functionality
     */

    it("hermes operator should be able to request funds withdrawal", async () => {
        const initialBalance = await token.balanceOf(hermes.address)

        const amount = new BN(500)
        const beneficiary = otherAccounts[1]
        await hermes.withdraw(beneficiary, amount, { from: operatorAddress })

        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.equal(initialBalance.sub(amount))

        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })

    it("should be not possible to withdraw not own funds", async () => {
        // Settle some funds, to make stake > balance
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const promise = generatePromise(new BN(700), new BN(0), channelState, operator)
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)

        const channel = await hermes.channels(channelId)
        channel.stake.should.be.bignumber.greaterThan(channel.balance)

        // Withdraw request should be rejected and no funds moved
        const initialBalance = await token.balanceOf(hermes.address)
        const amount = await hermes.availableBalance()
        const beneficiary = otherAccounts[2]
        await hermes.withdraw(beneficiary, amount).should.be.rejected

        initialBalance.should.be.bignumber.equal(await token.balanceOf(hermes.address))
    })

    it("hermes should be able to set new minStake", async () => {
        const stakeBefore = (await hermes.getStakeThresholds())[0]
        const newMinStake = 87654321
        await hermes.setMinStake(newMinStake, { from: operator.address })

        const stakeAfter = (await hermes.getStakeThresholds())[0]
        expect(stakeBefore.toNumber()).to.be.equal(25)
        expect(stakeAfter.toNumber()).to.be.equal(87654321)
    })

    it("not hermes should be not able to set new minStake", async () => {
        const newMinStake = 1
        await hermes.setMinStake(newMinStake).should.be.rejected
    })
})
