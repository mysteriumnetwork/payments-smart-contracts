/*
    This test is testing uni-directional, promise based accountant hub payment multi channel implementation.
    Smart-contract code can be found in `contracts/AccountantImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    generateChannelId,
    topUpTokens,
    topUpEthers 
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { 
    signChannelBalanceUpdate,
    signChannelBeneficiaryChange,
    signChannelLoanReturnRequest,
    signChannelOpening,
    generatePromise 
} = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("TestAccountantImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = OneEther = web3.utils.toWei(new BN(1), 'ether')

contract.only('Accountant Contract Implementation tests', ([txMaker, beneficiaryA, beneficiaryB, beneficiaryC, ...otherAccounts]) => {
    const operator = wallet.generateAccount()   // Generate accountant operator wallet
    const identityA = wallet.generateAccount()
    const identityB = wallet.generateAccount()
    const identityC = wallet.generateAccount()

    let token, accountant, registry, promise
    before(async () => {
        token = await MystToken.new()
        const dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new()
        const channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 1)

        // Give some ethers for gas for operator
        topUpEthers(txMaker, operator.address, OneEther)

        // Give tokens for txMaker so it could use them registration and lending stuff
        topUpTokens(token, txMaker, OneToken)
        await token.approve(registry.address, OneToken)
    })

    it("should register and initialize accountant", async () => {
        await registry.registerAccountant(operator.address, 10)
        const accountantId = await registry.getAccountantAddress(operator.address)
        expect(await registry.isActiveAccountant(accountantId)).to.be.true

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

    it("registered identity should be able to open incoming channel", async () => {
        await registry.registerIdentity(identityA.address, accountant.address, 0, beneficiaryA)
        expect(await registry.isRegistered(identityA.address)).to.be.true

        const expectedChannelId = generateChannelId(identityA.address, accountant.address)
        expect(await accountant.isOpened(expectedChannelId)).to.be.false

        const signature = signChannelOpening(accountant.address, identityA, beneficiaryA)
        await accountant.openChannel(identityA.address, beneficiaryA, 0, signature)
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryA)
        expect(channel.balance.toNumber()).to.be.equal(0)
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.loan.toNumber()).to.be.equal(0)
        expect(channel.loanTimelock.toNumber()).to.be.equal(0)
        expect(channel.lastUsedNonce.toNumber()).to.be.equal(0)
    })

    it("registered identity should be able to open deposited channel with auto balance topUp", async () => {
        const initialTokenBalance = await token.balanceOf(txMaker)
        const expectedChannelId = generateChannelId(identityB.address, accountant.address)
        const amountToLend = new BN(777)
        const accountantInitialBalance = await accountant.availableBalance() 

        // Register identity first
        await registry.registerIdentity(identityB.address, accountant.address, 0, beneficiaryB)
        expect(await registry.isRegistered(identityB.address)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.false

        // Open incomming channel with auto balance topUp by lending some tokens to accountant
        await token.approve(accountant.address, amountToLend)
        const signature = signChannelOpening(accountant.address, identityB, beneficiaryB, amountToLend)
        await accountant.openChannel(identityB.address, beneficiaryB, amountToLend, signature)
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Tokens to lend should be transfered from txMaker to accountant contract
        const txMakerTokenBalance = await token.balanceOf(txMaker)
        txMakerTokenBalance.should.be.bignumber.equal(initialTokenBalance.sub(amountToLend))

        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(accountantInitialBalance.add(amountToLend))

        // Channel have to be opened with proper state
        const channel = await accountant.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryB)
        expect(channel.balance.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.loan.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.loanTimelock.toNumber()).to.be.equal(0)
        expect(channel.lastUsedNonce.toNumber()).to.be.equal(0)

        // Accountant available (not locked in any channel) funds should be not incresed
        const availableBalance = await accountant.availableBalance()
        expect(availableBalance.toNumber()).to.be.equal(accountantInitialBalance.toNumber())
    })

    it("should be possible to open channel during registering identity into registry", async () => {
        const initialTxMakerBalance = await token.balanceOf(txMaker)
        const initialAccountantBalance = await token.balanceOf(accountant.address)
        const expectedChannelId = generateChannelId(identityC.address, accountant.address)
        const amountToLend = new BN(888)

        // Register identity and open channel with accountant
        await registry.registerIdentity(identityC.address, accountant.address, amountToLend, beneficiaryC)
        expect(await registry.isRegistered(identityC.address)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Tokens to lend should be transfered from txMaker to accountant contract
        const txMakerTokenBalance = await token.balanceOf(txMaker)
        txMakerTokenBalance.should.be.bignumber.equal(initialTxMakerBalance.sub(amountToLend))

        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(initialAccountantBalance.add(amountToLend))

        // Channel have to be opened with proper state
        const channel = await accountant.channels(expectedChannelId)
        expect(channel.beneficiary).to.be.equal(beneficiaryC)
        expect(channel.balance.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.settled.toNumber()).to.be.equal(0)
        expect(channel.loan.toNumber()).to.be.equal(amountToLend.toNumber())
        expect(channel.loanTimelock.toNumber()).to.be.equal(0)
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
        const channelState = Object.assign({}, {channelId}, await accountant.channels(channelId))
        const amountToPay = new BN('100')
        const balanceBefore = await token.balanceOf(beneficiaryB)

        promise = generatePromise(amountToPay, new BN(0), channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

        const balanceAfter = await token.balanceOf(beneficiaryB)
        balanceAfter.should.be.bignumber.equal(balanceBefore.add(amountToPay))
    })

    it("should fail while settling same promise second time", async () => {
        await accountant.settlePromise(promise.channelId,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.extraDataHash,
            promise.signature).should.be.rejected
    })

    it("should fail settling promise signed by wrong operator", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const channelState = Object.assign({}, {channelId}, await accountant.channels(channelId))
        const amountToPay = new BN('100')

        const promise = generatePromise(amountToPay, new BN(0), channelState, identityB)
        await accountant.settlePromise(
            promise.channelId,
            promise.amount,
            promise.fee,
            promise.lock,
            promise.extraDataHash,
            promise.signature).should.be.rejected
    })

    it("should send fee for transaction maker", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelState = Object.assign({}, {channelId}, await accountant.channels(channelId))
        const amountToPay = new BN('100')
        const fee = new BN('7')

        const beneficiaryBalanceBefore = await token.balanceOf(beneficiaryC)
        const txMakerBalanceBefore = await token.balanceOf(txMaker)
        
        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)
        
        const beneficiaryBalanceAfter = await token.balanceOf(beneficiaryC)
        beneficiaryBalanceAfter.should.be.bignumber.equal(beneficiaryBalanceBefore.add(amountToPay))

        const txMakerBalanceAfter = await token.balanceOf(txMaker)
        txMakerBalanceAfter.should.be.bignumber.equal(txMakerBalanceBefore.add(fee))
    })

    it("should settle as much as it can when promise is bigger than channel balance", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelState = Object.assign({}, {channelId}, await accountant.channels(channelId))
        const amountToPay = new BN('1000')
        const fee = new BN('0')

        promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('881') // initial balance of 888 - 7 tokens paid for tx maker
    })

    it("should settle rest of promise amount after channel rebalance", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const channelBalance = (await accountant.channels(channelId)).balance.toNumber()
        // const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)

        // Rebalance channel
        expect(channelBalance).to.be.equal(0)
        await accountant.rebalanceChannel(channelId)
        const channelBalanceAfter = (await accountant.channels(channelId)).balance.toNumber()
        expect(channelBalanceAfter).to.be.equal(888)

        // Settle previous promise to get rest of promised coins
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)
        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal('1100')  // Two previous promises of 100 + 1000
    })

    /**
     * Testing channel rebalance and stake/loans management functionality
     */

    it("accountant operator can make increase channel balance to settle bigger promises", async () => {
        const channelId = generateChannelId(identityC.address, accountant.address)
        const accountantInitialBalance = await accountant.availableBalance()
        const channelInitialBalace = (await accountant.channels(channelId)).balance

        const newBalance = new BN('10000')
        const nonce = new BN(1)
        const signature = signChannelBalanceUpdate(channelId, nonce, newBalance, operator)
        await accountant.updateChannelBalance(channelId, nonce, newBalance, signature)

        // Channel balance should be incresed
        const channelState = Object.assign({}, {channelId}, await accountant.channels(channelId))
        channelState.balance.should.be.bignumber.equal(newBalance)

        // Accountant available (not locked in any channel) funds should be decreased by amount channel was increased
        const availableBalance = await accountant.availableBalance()
        const expectedBalance = accountantInitialBalance.sub(newBalance.sub(channelInitialBalace))
        expect(availableBalance.toNumber()).to.be.equal(expectedBalance.toNumber())

        // Settle big promise
        const initialBeneficiaryBalance = await token.balanceOf(beneficiaryC)
        const amountToPay = new BN('5000')
        const fee = new BN('0')
        const promise = generatePromise(amountToPay, fee, channelState, operator)
        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, promise.lock, promise.extraDataHash, promise.signature)

        const beneficiaryBalance = await token.balanceOf(beneficiaryC)
        beneficiaryBalance.should.be.bignumber.equal(initialBeneficiaryBalance.add(amountToPay))
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
        const nonce = new BN(2)
        const signature = signChannelBalanceUpdate(channelId, nonce, newBalance, operator)
        await accountant.updateChannelBalance(channelId, nonce, newBalance, signature)

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
        const nonce = new BN(3)
        const signature = signChannelBalanceUpdate(channelId, nonce, newBalance, operator)
        await accountant.updateChannelBalance(channelId, nonce, newBalance, signature).should.be.rejected
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

    it("party should be able to request loan/stake return", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const nonce = new BN(1)
        const signature = signChannelLoanReturnRequest(channelId, nonce, identityB)
        await accountant.requestLoanReturn(identityB.address, nonce, signature)

        const expectedBlockNumber = (await web3.eth.getBlock('latest')).number + 4
        const channel = await accountant.channels(channelId)
        expect(channel.loanTimelock.toNumber()).to.be.equal(expectedBlockNumber)
    })

    it("should fail to request loan return if one alredy requested", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const nonce = new BN(2)
        const signature = signChannelLoanReturnRequest(channelId, nonce, identityB)
        await accountant.requestLoanReturn(identityB.address, nonce, signature).should.be.rejected
    })

    it("should fail finalising loan return until timelock passed", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        await accountant.finalizeLoanReturn(channelId).should.be.rejected
    })

    it("party should be able to change beneficiary", async () => {
        const newBeneficiary = otherAccounts[0]
        const channelId = generateChannelId(identityB.address, accountant.address)
        const nonce = new BN(3)
        const signature = signChannelBeneficiaryChange(channelId, newBeneficiary, nonce, identityB)

        await accountant.setBeneficiary(identityB.address, newBeneficiary, nonce, signature)

        expect((await accountant.channels(channelId)).beneficiary).to.be.equal(newBeneficiary)
    })

    it("should finalise loan return", async () => {
        const channelId = generateChannelId(identityB.address, accountant.address)
        const expectedTxBlockNumber = (await web3.eth.getBlock('latest')).number
        const initialChannelState = await accountant.channels(channelId)
        const loanTimelock = initialChannelState.loanTimelock
        expect(loanTimelock.toNumber()).to.be.above(expectedTxBlockNumber)
        
        await accountant.finalizeLoanReturn(channelId)
        const beneficiaryBalance = await token.balanceOf(otherAccounts[0])
        beneficiaryBalance.should.be.bignumber.equal(initialChannelState.loan)

        const channel = await accountant.channels(channelId)
        expect(channel.loan.toNumber()).to.be.equal(0)
        expect(channel.loanTimelock.toNumber()).to.be.equal(0)

    })

    /**
     * Testing withdraw functionality
     */

    // accountant can withdrawal availableBalance funds without any permission

    /**
     * Testing other functionality
     */
    it("party should be able to change beneficiary", async () => {
        
    })
})
