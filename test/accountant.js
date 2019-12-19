/*
    This test is testing uni-directional, promise based accountant hub payment multi channel implementation.
    Smart-contract code can be found in `contracts/AccountantImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
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

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("TestAccountantImplementation")
const ChannelImplementationProxy = artifacts.require("ChannelImplementationProxy")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)

const operatorPrivKey = Buffer.from('d6dd47ec61ae1e85224cec41885eec757aa77d518f8c26933e5d9f0cda92f3c3', 'hex')

contract('Accountant Contract Implementation tests', ([txMaker, operatorAddress, beneficiaryA, beneficiaryB, beneficiaryC, beneficiaryD, ...otherAccounts]) => {
    const operator = wallet.generateAccount(operatorPrivKey)
    const identityA = wallet.generateAccount()
    const identityB = wallet.generateAccount()
    const identityC = wallet.generateAccount()
    const identityD = wallet.generateAccount()

    let token, accountant, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new(token.address, operator.address, 0, OneToken)
        const channelImplementation = await ChannelImplementationProxy.new()
        const config = await setupConfig(txMaker, channelImplementation.address, accountantImplementation.address)
        registry = await Registry.new(token.address, dex.address, config.address, 0, 1)

        // Give some ethers for gas for operator
        await topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize accountant", async () => {
        await registry.registerAccountant(operator.address, 10, 0, OneToken)
        const accountantId = await registry.getAccountantAddress(operator.address)
        expect(await registry.isAccountant(accountantId)).to.be.true

        // Initialise accountant object
        accountant = await AccountantImplementation.at(accountantId)

        // Topup some balance for accountant
        topUpTokens(token, accountant.address, new BN(100000))
    })

    it("already initialized accountant should reject initialization request", async () => {
        expect(await accountant.isInitialized()).to.be.true
        await accountant.initialize(token.address, operator.address).should.be.rejected
    })

    /**
     * Testing channel opening functionality
     */

    it('should use proper channelId format', async () => {
        const expectedChannelId = generateChannelId(identityA.address, accountant.address)
        const channelId = await accountant.getChannelId(identityA.address)
        expect(channelId).to.be.equal(expectedChannelId)
    })

    it("registered identity should already have incoming channel", async () => {
        const regSignature = signIdentityRegistration(registry.address, accountant.address, Zero, Zero, beneficiaryA, identityA)
        await registry.registerIdentity(accountant.address, Zero, Zero, beneficiaryA, regSignature)
        expect(await registry.isRegistered(identityA.address)).to.be.true

        const expectedChannelId = generateChannelId(identityA.address, accountant.address)
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryA)
        expect(channel.balance.toNumber()).to.be.equal(0)
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.loan.toNumber()).to.be.equal(0)
        expect(channel.lastUsedNonce.toNumber()).to.be.equal(0)
    })

    it("should be possible to open channel during registering identity into registry", async () => {
        const initialAccountantBalance = await token.balanceOf(accountant.address)
        const expectedChannelId = generateChannelId(identityB.address, accountant.address)
        const amountToLend = new BN(777)

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(identityB.address, accountant.address)
        await token.mint(channelAddress, amountToLend)
        expect(Number(await token.balanceOf(channelAddress))).to.be.equal(amountToLend.toNumber())

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, amountToLend, Zero, beneficiaryB, identityB)
        await registry.registerIdentity(accountant.address, amountToLend, Zero, beneficiaryB, signature)
        expect(await registry.isRegistered(identityB.address)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Tokens to lend should be transfered from channel address to accountant contract
        const channelBalance = await token.balanceOf(channelAddress)
        channelBalance.should.be.bignumber.equal(Zero)

        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(initialAccountantBalance.add(amountToLend))

        // Channel have to be opened with proper state
        const channel = await accountant.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryB)
        expect(channel.balance.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.loan.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.lastUsedNonce.toNumber()).to.be.equal(0)

        // Accountant available (not locked in any channel) funds should be not incresed
        const availableBalance = await accountant.availableBalance()
        expect(availableBalance.toNumber()).to.be.equal(100000) // Equal to initial balance
    })

    /**
     * Testing promise settlement functionality
     */

    it("should be possible to settle promise issued by accountant", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryB)

        promise = generatePromise(amountToPay, new BN(0), channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryB)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))
    })

    it("should fail while settling same promise second time", async () => {
        await accountant.settlePromise(promise.channelId,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.signature).should.be.rejected
    })

    it("should fail settling promise signed by wrong operator", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const amountToPay = new BN('100')

        const promise = generatePromise(amountToPay, new BN(0), channelState, identityB)
        await accountant.settlePromise(
            promise.channelId,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.signature).should.be.rejected
    })

    it("should send fee for transaction maker", async () => {
        // TopUp channel -> send or mint tokens into channel address
        const channelId = generateChannelId(identityC.address, accountant.address)
        const topupChannelAddress = await registry.getChannelAddress(identityC.address, accountant.address)
        const amountToLend = new BN(888)
        await token.mint(topupChannelAddress, amountToLend)
        expect(Number(await token.balanceOf(topupChannelAddress))).to.be.equal(amountToLend.toNumber())

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, amountToLend, Zero, beneficiaryC, identityC)
        await registry.registerIdentity(accountant.address, amountToLend, Zero, beneficiaryC, signature)
        expect(await registry.isRegistered(identityC.address)).to.be.true
        expect(await accountant.isOpened(channelId)).to.be.true

        // Send transaction
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const amountToPay = new BN('100')
        const fee = new BN('7')

        const beneficiaryBalanceBefore = await token.balanceOf(beneficiaryC)
        const txMakerBalanceBefore = await token.balanceOf(txMaker)

        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalanceAfter = await token.balanceOf(beneficiaryC)
        beneficiaryBalanceAfter.should.be.bignumber.equal(beneficiaryBalanceBefore.add(amountToPay))

        const txMakerBalanceAfter = await token.balanceOf(txMaker)
        txMakerBalanceAfter.should.be.bignumber.equal(txMakerBalanceBefore.add(fee))
    })

    it("should settle as much as it can when promise is bigger than channel balance", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const amountToPay = new BN('1000')
        const fee = new BN('0')

        promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('881') // initial balance of 888 - 7 tokens paid for tx maker
    })

    it("should settle rest of promise amount after channel rebalance", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelBalance = (await accountant.channels(channelId)).balance.toNumber()

        // Rebalance channel
        expect(channelBalance).to.be.equal(0)
        await accountant.rebalanceChannel(channelId)
        const channelBalanceAfter = (await accountant.channels(channelId)).balance.toNumber()
        expect(channelBalanceAfter).to.be.equal(888)

        // Settle previous promise to get rest of promised coins
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)
        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('1100')  // Two previous promises of 100 + 1000
    })

    /**
     * Testing channel rebalance and stake/loans management functionality
     */

    it("accountant operator can make increase channel balance to settle bigger promises", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const newBalance = new BN('10000')
        await accountant.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // Channel balance should be incresed
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        channelState.balance.should.be.bignumber.equal(newBalance)

        // Accountant available (not locked in any channel) funds should not include stake and funds locked in channel
        const lockedFunds = await accountant.getLockedFunds()
        const stake = await accountant.getStake()
        const expectedBalance = (await token.balanceOf(accountant.address)).sub(stake).sub(lockedFunds)
        const availableBalance = await accountant.availableBalance()
        expect(availableBalance.toNumber()).to.be.equal(expectedBalance.toNumber())

        // Settle big promise
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)
        const amountToPay = new BN('5000')
        const fee = new BN('0')
        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(amountToPay))
    })

    it("should fail updating channel balance increase done by not operator", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const newBalance = new BN('20000')
        await accountant.updateChannelBalance(channelId, newBalance).should.be.rejected
    })

    it("should not rebalance when channel's balance is bigger than stake size", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        await accountant.rebalanceChannel(channelId).should.be.rejected
    })

    it("accountant operator should still be able to reduce channel's balance", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelInitialBalace = (await accountant.channels(channelId)).balance
        const accountantInitialAvailableBalace = await accountant.availableBalance()

        const newBalance = new BN('1000')
        await accountant.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // It should enable waiting period for channel balance reduction
        let channel = await accountant.channels(channelId)
        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        expect(channel.timelock.toNumber()).to.be.equal(expectedBlockNumber)
        channel.balance.should.be.bignumber.equal(channelInitialBalace)

        // Move some blocks
        for (let i = 0; i < 4; i++) {
            await accountant.moveBlock()
        }

        await accountant.updateChannelBalance(channelId, newBalance, { from: operatorAddress })

        // Channel balance should be decreased
        const channelBalance = (await accountant.channels(channelId)).balance
        channelBalance.should.be.bignumber.lessThan(channelInitialBalace)
        channelBalance.should.be.bignumber.equal(newBalance)

        // Accountant's available balance have to be increased
        const accountantAvailableBalance = await accountant.availableBalance()
        accountantAvailableBalance.should.be.bignumber.greaterThan(accountantInitialAvailableBalace)

        const channelBalanceDifference = channelInitialBalace.sub(newBalance)
        accountantAvailableBalance.should.be.bignumber.equal(accountantInitialAvailableBalace.add(channelBalanceDifference))
    })

    it("accountant operator should be not able to reduce channel's balance below stake size", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const newBalance = new BN('10')
        await accountant.updateChannelBalance(channelId, newBalance).should.be.rejected
    })

    it("party should be able to increase stake", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const channelInitialState = await accountant.channels(channelId)
        const accountantInitialBalance = await token.balanceOf(accountant.address)
        const accountantInitialAvailableBalace = await accountant.availableBalance()
        const initialBalanceLoanDiff = channelInitialState.loan.sub(channelInitialState.balance)
        const amountToLend = new BN('1500')

        // Increase stake
        await token.approve(accountant.address, amountToLend)
        await accountant.increaseLoan(channelId, amountToLend)

        const channelStake = await accountant.channels(channelId)
        channelStake.loan.should.be.bignumber.equal(channelInitialState.loan.add(amountToLend))
        channelStake.balance.should.be.bignumber.equal(channelInitialState.loan.add(amountToLend))

        // Tokens should be properly transfered into accountant smart contract address
        const accountantBalance = await token.balanceOf(accountant.address)
        accountantBalance.should.be.bignumber.equal(accountantInitialBalance.add(amountToLend))

        // Accountant abailable balance should be calculated properly
        const accountantAvailableBalance = await accountant.availableBalance()
        accountantAvailableBalance.should.be.bignumber.equal(accountantInitialAvailableBalace.sub(initialBalanceLoanDiff))
    })

    it("party should be able to change beneficiary", async () => {
        const newBeneficiary = otherAccounts[0]
        const channelId = generateChannelId(identityB.address, accountant.address)
        const nonce = new BN(3)
        const signature = signChannelBeneficiaryChange(channelId, newBeneficiary, nonce, identityB)

        await accountant.setBeneficiary(channelId, newBeneficiary, nonce, signature)

        expect((await accountant.channels(channelId)).beneficiary).to.be.equal(newBeneficiary)
    })

    it("should be possible to get loan back", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const initialChannelState = await accountant.channels(channelId)
        const accountantInitialAvailableBalace = await accountant.availableBalance()

        const nonce = new BN(4)
        const amount = initialChannelState.loan
        const signature = signChannelLoanReturnRequest(channelId, amount, nonce, identityB)

        await accountant.decreaseLoan(channelId, amount, nonce, signature)
        const beneficiaryBalance = await token.balanceOf(otherAccounts[0])
        beneficiaryBalance.should.be.bignumber.equal(initialChannelState.loan)

        const channel = await accountant.channels(channelId)
        expect(channel.loan.toNumber()).to.be.equal(0)
        expect(channel.balance.toNumber()).to.be.equal(0)

        // Available balance should be not changed because of getting channel's balance back available
        expect((await accountant.availableBalance()).toNumber()).to.be.equal(accountantInitialAvailableBalace.toNumber())
    })

    it("should handle huge channel loans", async () => {
        const channelId = generateChannelId(identityD.address, accountant.address)
        const amountToLend = OneToken

        // TopUp channel -> send or mint tokens into channel address
        const channelAddress = await registry.getChannelAddress(identityD.address, accountant.address)
        await topUpTokens(token, channelAddress, amountToLend)

        // Register identity and open channel with accountant
        let signature = signIdentityRegistration(registry.address, accountant.address, amountToLend, Zero, beneficiaryD, identityD)
        await registry.registerIdentity(accountant.address, amountToLend, Zero, beneficiaryD, signature)
        expect(await registry.isRegistered(identityD.address)).to.be.true
        expect(await accountant.isOpened(channelId)).to.be.true

        // Settle all you can
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const promise = generatePromise(amountToLend, new BN(0), channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        // Ensure that amountToLend is bigger than stake + locked in channels funds
        let minimalExpectedBalance = await accountant.minimalExpectedBalance()
        expect(minimalExpectedBalance.toNumber()).to.be.below(amountToLend.toNumber())

        // Try getting loan back
        const currentBalance = await token.balanceOf(accountant.address)
        const nonce = new BN(5)
        signature = signChannelLoanReturnRequest(channelId, amountToLend, nonce, identityD)
        await accountant.decreaseLoan(channelId, amountToLend, nonce, signature)

        minimalExpectedBalance = await accountant.minimalExpectedBalance()
        const availableToUse = currentBalance.sub(minimalExpectedBalance)
        const channel = await accountant.channels(channelId)
        expect(channel.loan.toNumber()).to.be.equal(amountToLend.sub(availableToUse).toNumber())
        expect(channel.balance.toNumber()).to.be.equal(0)

        // Accountant should become not active
        expect(await accountant.isAccountantActive()).to.be.false
    })

    it("should resolve emergency", async () => {
        await topUpTokens(token, accountant.address, OneToken)
        await accountant.resolveEmergency()
        expect(await accountant.isAccountantActive()).to.be.true
    })

    /**
     * Testing accountant's funds withdrawal functionality
     */

    it("accountant operator should be able to request funds withdrawal", async () => {
        const initialBalance = await token.balanceOf(accountant.address)

        const amount = new BN(500)
        const beneficiary = otherAccounts[1]
        await accountant.withdraw(beneficiary, amount, { from: operatorAddress })

        const accountantBalance = await token.balanceOf(accountant.address)
        accountantBalance.should.be.bignumber.equal(initialBalance.sub(amount))

        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal(amount)
    })

    it("should be not possible to withdraw not own funds", async () => {
        // Settle some funds, to make loan > balance
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelState = Object.assign({}, { channelId }, await accountant.channels(channelId))
        const promise = generatePromise(new BN(700), new BN(0), channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.signature)

        const channel = await accountant.channels(channelId)
        channel.loan.should.be.bignumber.greaterThan(channel.balance)

        // Withdraw request should be rejected and no funds moved
        const initialBalance = await token.balanceOf(accountant.address)
        const amount = await accountant.availableBalance()
        const beneficiary = otherAccounts[2]
        await accountant.withdraw(beneficiary, amount).should.be.rejected

        initialBalance.should.be.bignumber.equal(await token.balanceOf(accountant.address))
    })

})
