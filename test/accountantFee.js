require('chai')
.use(require('chai-as-promised'))
.should()
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')
const { topUpTokens, generateChannelId, keccak } = require('./utils/index.js')
const { 
    signIdentityRegistration,
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

contract('Accountant fee', ([txMaker, operatorAddress, ...beneficiaries]) => {
    let token, channelImplementation, accountant, dex, registry
    before(async () => {
        token = await MystToken.new()
        dex = await MystDex.new()
        const accountantImplementation = await AccountantImplementation.new(token.address, accountantOperator.address, 0, OneToken)
        channelImplementation = await ChannelImplementation.new()
        registry = await Registry.new(token.address, dex.address, channelImplementation.address, accountantImplementation.address, 0, 0)

        // Topup some tokens into txMaker address so it could register accountant
        await topUpTokens(token, txMaker, 1000)
        await token.approve(registry.address, 1000)
    })

    it('should calculate proper fee righ after accountant registration', async () => {
        // Register accountant
        const accountantFee = 250 // 2.50%
        await registry.registerAccountant(accountantOperator.address, 100, accountantFee, OneToken)
        const accountantId = await registry.getAccountantAddress(accountantOperator.address)
        accountant = await AccountantImplementation.at(accountantId)

        // Fee of settling one token should be 0.025 token
        const oneTokenSettleFee = await accountant.calculateAccountantFee(OneToken)
        let fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.025)

        // When settling sumer small values, we'll round fee to avoid calculation errors or value overflow
        const smallValueToSettle = new BN(100)  // 0.000000000000000100 token
        fee = await accountant.calculateAccountantFee(smallValueToSettle)
        fee.should.be.bignumber.equal(new BN(3))
    })

    it('should open provider channel', async () => {
        const expectedChannelId = generateChannelId(provider.address, accountant.address)
        const initialAccountantBalance = await token.balanceOf(accountant.address)

        // Guaranteed incomming channel size
        const channelStake = new BN(1000)

        // Topup some tokens into paying channel
        const channelAddress = await registry.getChannelAddress(provider.address, accountant.address)
        await topUpTokens(token, channelAddress, channelStake)

        // Register identity and open channel with accountant
        const signature = signIdentityRegistration(registry.address, accountant.address, channelStake, Zero, beneficiaries[1], provider)
        await registry.registerIdentity(accountant.address, channelStake, Zero, beneficiaries[1], signature)
        expect(await registry.isRegistered(provider.address)).to.be.true
        expect(await accountant.isOpened(expectedChannelId)).to.be.true

        // Channel stake have to be transfered to accountant
        const accountantTokenBalance = await token.balanceOf(accountant.address)
        accountantTokenBalance.should.be.bignumber.equal(initialAccountantBalance.add(channelStake))

        const channel = await accountant.channels(expectedChannelId)
        expect(channel.balance.toNumber()).to.be.equal(channelStake.toNumber())
    })

    it('should properly charge accountant fee', async () => {
        const channelId = generateChannelId(provider.address, accountant.address)
        const amount = new BN(250)
        const R = randomBytes(32)
        const hashlock = keccak(R)

        // Create accountant promise
        const promise = createPromise(channelId, amount, Zero, hashlock, accountantOperator)

        // Calculate expected accountant fee
        const fee = await accountant.calculateAccountantFee(amount)

        // Settle promise
        const initialAccountantBalance = await token.balanceOf(accountant.address)
        const expectedAccountantBalance = initialAccountantBalance.sub(amount).add(fee)
        const initialChannelBalance = (await accountant.channels(channelId)).balance
        const expectedChannelBalance = initialChannelBalance.sub(amount)

        await accountant.settlePromise(promise.channelId, promise.amount, promise.fee, R, promise.signature)

        const channelBalance = (await accountant.channels(channelId)).balance
        channelBalance.should.be.bignumber.equal(expectedChannelBalance)

        const accountantBalance = await token.balanceOf(accountant.address)
        accountantBalance.should.be.bignumber.equal(expectedAccountantBalance)
    })

    it('should update accountant fee', async () => {
        const initialFee = await accountant.lastFee()
        const newFee = new BN(175) // 1.75%
        const delayBlocks = 4

        const tx = await accountant.setAccountantFee(newFee, {from: operatorAddress})

        const lastFee = await accountant.lastFee()
        lastFee.value.should.be.bignumber.equal(newFee)
        expect(lastFee.validFrom.toNumber()).to.be.equal(tx.receipt.blockNumber + delayBlocks)

        const previousFee = await accountant.previousFee()
        previousFee.value.should.be.bignumber.equal(initialFee.value)
        previousFee.validFrom.should.be.bignumber.equal(initialFee.validFrom)
    })

    it('should still calculate previous fee value untill validFrom block not arrived', async () => {
        const oneTokenSettleFee = await accountant.calculateAccountantFee(OneToken)
        let fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.025)
    })

    it('should not allow to update not active last fee', async () => {
        const newFee = new BN(500) // 5%
        await accountant.setAccountantFee(newFee, {from: operatorAddress}).should.be.rejected
    })

    it('should calculate new fee after validFrom block is arrived', async () => {
        // Jump over a few blocks
        for (let i=0; i<4; i++) {
            await accountant.moveBlock()
        }

        const oneTokenSettleFee = await accountant.calculateAccountantFee(OneToken)
        fee = oneTokenSettleFee / OneToken
        expect(fee).to.be.equal(0.0175)
    })

    it('should fail updating accountant fee from not operator account', async () => {
        const newFee = new BN(175) // 1.75%
        await accountant.setAccountantFee(newFee).should.be.rejected
    })

    it('fee can not be bigger that 50%', async () => {
        const newFee = new BN(5001) // 50.01%
        await accountant.setAccountantFee(newFee, {from: operatorAddress}).should.be.rejected
    })

})