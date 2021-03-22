/*
    This test is testing uni-directional, promise based herms hub payment multi channel implementation.
    Smart-contract code can be found in `contracts/HermesImplementation.sol`.
*/

const { BN } = require('@openzeppelin/test-helpers')
const {
    generateChannelId,
    topUpTokens,
    topUpEthers,
    setupDEX
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const {
    signChannelBeneficiaryChange,
    signChannelLoanReturnRequest,
    signIdentityRegistration,
    generatePromise
} = require('./utils/client.js')

const MystToken = artifacts.require("TestMystToken")
const Registry = artifacts.require("Registry")
const HermesImplementation = artifacts.require("TestHermesImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = web3.utils.toWei(new BN('1000000000000000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const One = new BN(1)
const hermesURL = Buffer.from('http://test.hermes')
const ChainID = 1

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')

const minStake = new BN(25)
const maxStake = new BN(100000)

contract('Hermes Contract Implementation tests', ([txMaker, operatorAddress, beneficiaryA, beneficiaryB, beneficiaryC, beneficiaryD, ...otherAccounts]) => {
    const operator = wallet.generateAccount(operatorPrivKey)
    const identityA = wallet.generateAccount()
    const identityB = wallet.generateAccount()
    const identityC = wallet.generateAccount()
    const identityD = wallet.generateAccount()

    let token, dex, hermes, registry, promise
    before(async () => {
        token = await MystToken.new()
        dex = await setupDEX(token, txMaker)
        const hermesImplementation = await HermesImplementation.new(token.address, operator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new()
        await registry.initialize(token.address, dex.address, 1, channelImplementation.address, hermesImplementation.address)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize hermes", async () => {
        await registry.registerHermes(operator.address, 10, 0, minStake, maxStake, hermesURL)
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
        const amountToPay = new BN('25')
        const balanceBefore = await token.balanceOf(beneficiaryA)

        promise = generatePromise(amountToPay, Zero, channelState, operator, identityA.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryA)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))
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
        // Ensure that hermes would have enough available balance
        await topUpTokens(token, hermes.address, maxStake)

        const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = maxStake.add(new BN('1000'))  // `OneToken` is a maxStake. This is 1000 wei more than max stake
        const fee = Zero

        promise = generatePromise(amountToPay, fee, channelState, operator, identityC.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(maxStake)) // there is not possible to settle more than maxStake in one tx
    })

    it("should settle rest of promise amount after channel rebalance", async () => {
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)

        // Settle previous promise to get rest of promised coins
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)
        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(new BN('1000')))  // 1000 should be left after previous promise
    })

    /**
     * Testing promise settlement via uniswap
     */

    it("should settle into ETH", async () => {
        const channelId = generateChannelId(identityC.address, hermes.address)
        const channelState = Object.assign({}, { channelId }, await hermes.channels(channelId))
        const amountToPay = new BN('100')
        const expectedETHAmount = new BN('49') // 100 MYST --> 49 ETH given 10000000/5000000 liquidity pool.
        const balanceBefore = new BN(await web3.eth.getBalance(beneficiaryC))

        promise = generatePromise(amountToPay, new BN(0), channelState, operator, identityC.address)
        await hermes.settleWithDEX(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = new BN(await web3.eth.getBalance(beneficiaryC))
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(expectedETHAmount))
    })

    /**
     * Testing channel stake management functionality
     */

    it("party should be able to increase stake", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const channelInitialState = await hermes.channels(channelId)
        const hermesInitialBalance = await token.balanceOf(hermes.address)
        const hermesInitialAvailableBalace = await hermes.availableBalance()
        const amountToLend = new BN('1500')

        // Increase stake
        await token.approve(hermes.address, amountToLend)
        await hermes.increaseStake(channelId, amountToLend)

        const channelState = await hermes.channels(channelId)
        channelState.stake.should.be.bignumber.equal(channelInitialState.stake.add(amountToLend))

        // Tokens should be properly transfered into hermes smart contract address
        const hermesBalance = await token.balanceOf(hermes.address)
        hermesBalance.should.be.bignumber.equal(hermesInitialBalance.add(amountToLend))

        // hermes abailable balance should be calculated properly
        const hermesAvailableBalance = await hermes.availableBalance()
        hermesAvailableBalance.should.be.bignumber.equal(hermesInitialAvailableBalace)
    })

    it("party should be able to change beneficiary", async () => {
        const newBeneficiary = otherAccounts[0]
        const nonce = (await registry.lastNonce()).add(One)
        const signature = signChannelBeneficiaryChange(ChainID, registry.address, newBeneficiary, nonce, identityB)

        await registry.setBeneficiary(identityB.address, newBeneficiary, signature)

        expect((await registry.getBeneficiary(identityB.address))).to.be.equal(newBeneficiary)
    })

    it("should be possible to get stake back", async () => {
        const channelId = generateChannelId(identityB.address, hermes.address)
        const initialChannelState = await hermes.channels(channelId)
        const hermesInitialAvailableBalace = await hermes.availableBalance()

        const nonce = initialChannelState.lastUsedNonce.add(One)
        const amount = initialChannelState.stake
        const signature = signChannelLoanReturnRequest(channelId, amount, Zero, nonce, identityB)

        await hermes.decreaseStake(identityB.address, amount, Zero, signature)
        const beneficiaryBalance = await token.balanceOf(otherAccounts[0])
        beneficiaryBalance.should.be.bignumber.equal(initialChannelState.stake)

        const channel = await hermes.channels(channelId)
        expect(channel.stake.toNumber()).to.be.equal(0)

        // Available balance should be not changed because of getting channel's balance back available
        const availableBalance = await hermes.availableBalance()
        availableBalance.should.be.bignumber.equal(hermesInitialAvailableBalace)
    })

    it("should handle huge channel stakes", async () => {
        const channelId = generateChannelId(identityD.address, hermes.address)
        const amountToLend = maxStake

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
        const promise = generatePromise(amountToLend, Zero, channelState, operator, identityD.address)
        await hermes.settlePromise(promise.identity, promise.amount, promise.fee, promise.lock, promise.signature)

        // Ensure that amountToLend is bigger than stake + locked in channels funds
        let minimalExpectedBalance = await hermes.minimalExpectedBalance()
        minimalExpectedBalance.should.be.bignumber.above(amountToLend)

        // Try getting stake back
        const nonce = channelState.lastUsedNonce.add(One)

        signature = signChannelLoanReturnRequest(channelId, amountToLend, Zero, nonce, identityD)
        await hermes.decreaseStake(identityD.address, amountToLend, Zero, signature)

        const channel = await hermes.channels(channelId)
        channel.stake.should.be.bignumber.equal(Zero)

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
        const promise = generatePromise(new BN(700), Zero, channelState, operator)
        await hermes.settlePromise(identityC.address, promise.amount, promise.fee, promise.lock, promise.signature)

        // Withdraw request should be rejected and no funds moved
        const initialBalance = await token.balanceOf(hermes.address)
        const amount = await hermes.availableBalance()
        const beneficiary = otherAccounts[2]
        await hermes.withdraw(beneficiary, amount).should.be.rejected

        initialBalance.should.be.bignumber.equal(await token.balanceOf(hermes.address))
    })

    it("hermes should be able to set new minStake", async () => {
        const stakeBefore = (await hermes.getStakeThresholds())[0]
        const newMinStake = 54321
        await hermes.setMinStake(newMinStake, { from: operator.address })

        const stakeAfter = (await hermes.getStakeThresholds())[0]
        expect(stakeBefore.toNumber()).to.be.equal(25)
        expect(stakeAfter.toNumber()).to.be.equal(54321)
    })

    it("not hermes operator should be not able to set new minStake", async () => {
        const newMinStake = 1
        await hermes.setMinStake(newMinStake).should.be.rejected
    })
})
