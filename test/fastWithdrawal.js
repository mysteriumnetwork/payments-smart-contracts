/*
    This test is testing fast withdrawal from uni-directional channels with hermes hub.
    Smart-contract code can be found in `contracts/ChannelImplementation.sol`.
*/

const { BN } = require('@openzeppelin/test-helpers')
const {
    topUpTokens,
    topUpEthers,
    setupDEX
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { generatePromise, signFastWithdrawal } = require('./utils/client.js')

const MystToken = artifacts.require("TestMystToken")
const TestChannelImplementation = artifacts.require("TestChannelImplementation")
const TestHermesImplementation = artifacts.require("TestHermesImplementation")

const OneToken = web3.utils.toWei(new BN('100000000'), 'wei')
const OneEther = web3.utils.toWei(new BN(1), 'ether')
const Zero = new BN(0)
const ChainID = 1 // tests are run in ganache which uses 1 as chainId, same as mainnet

contract('Fast withdrawal from consumer channel', ([txMaker, ...otherAccounts]) => {
    const identity = wallet.generateAccount()     // Generate identity
    const identityHash = identity.address         // identity hash = keccak(publicKey)[:20]
    const hermes = wallet.generateAccount()   // Generate hermes operator wallet
    let token, channel
    before(async () => {
        token = await MystToken.new()
        const dex = await setupDEX(token, txMaker)
        hermesImplementation = await TestHermesImplementation.new()
        await hermesImplementation.initialize(token.address, hermes.address, 0, 0, OneToken, dex.address)
        channel = await TestChannelImplementation.new(token.address, dex.address, identityHash, hermesImplementation.address, Zero)

        // Give some ethers for gas for hermes and some tokens for channel
        await topUpEthers(txMaker, hermes.address, OneEther)
        await topUpTokens(token, channel.address, OneToken.mul(new BN(100))) // topup 100 full tokens
    })

    it("should settle promise and send funds into beneficiary address", async () => {
        const channelState = Object.assign({}, await channel.hermes(), { channelId: channel.address })
        const amount = OneToken.mul(new BN(2)) // 2 full tokens
        const channelBalanceBefore = await token.balanceOf(channel.address)

        const promise = generatePromise(amount, new BN(0), channelState, identity)
        await channel.settlePromise(promise.amount, promise.fee, promise.lock, promise.signature)

        const channelBalanceAfter = await token.balanceOf(channel.address)
        channelBalanceAfter.should.be.bignumber.equal(channelBalanceBefore.sub(amount))

        const hermesTotalBalance = await token.balanceOf(channelState.contractAddress)
        hermesTotalBalance.should.be.bignumber.equal(promise.amount)
    })

    it("should allow fast withdrawal of remaining balance", async () => {
        const beneficiary = otherAccounts[1]
        const lastBlockNumber = (await web3.eth.getBlock('latest')).number
        const nonce = 0

        const remainingBalance = await token.balanceOf(channel.address)
        expect(remainingBalance.toNumber()).to.be.greaterThan(0)

        const request = signFastWithdrawal(ChainID, channel.address, OneToken, Zero, beneficiary, lastBlockNumber + 1, nonce, identity, hermes)
        await channel.fastExit(request.amount, request.fee, request.beneficiary, request.validUntil, request.identitySignature, request.hermesSignature)

        const beneficiaryBalance = await token.balanceOf(beneficiary)
        beneficiaryBalance.should.be.bignumber.equal(OneToken)
    })

    it("should reject fast withdrawal with wrong hermes signature", async () => {
        const randomSigner = wallet.generateAccount()
        const beneficiary = otherAccounts[1]
        const lastBlockNumber = (await web3.eth.getBlock('latest')).number
        const nonce = 1

        const remainingBalance = await token.balanceOf(channel.address)
        expect(remainingBalance.toNumber()).to.be.greaterThan(0)

        const request = signFastWithdrawal(ChainID, channel.address, OneToken, Zero, beneficiary, lastBlockNumber + 1, nonce, identity, randomSigner)
        await channel.fastExit(request.amount, request.fee, request.beneficiary, request.validUntil, request.identitySignature, request.hermesSignature).should.be.rejected
    })

    it("should send proper fee for transactor", async () => {
        const beneficiary = otherAccounts[1]
        const initialBeneficiaryBalance = await token.balanceOf(beneficiary)
        const lastBlockNumber = (await web3.eth.getBlock('latest')).number
        const nonce = 1
        const amount = OneToken
        const fee = new BN('200000') // transactor fee

        const remainingBalance = await token.balanceOf(channel.address)
        expect(remainingBalance.toNumber()).to.be.greaterThan(0)

        const request = signFastWithdrawal(ChainID, channel.address, amount, fee, beneficiary, lastBlockNumber + 10, nonce, identity, hermes)
        await channel.fastExit(request.amount, request.fee, request.beneficiary, request.validUntil, request.identitySignature, request.hermesSignature)

        const channelBalance = await token.balanceOf(channel.address)
        channelBalance.should.be.bignumber.equal(remainingBalance.sub(amount))

        const beneficiaryBalanceAfter = await token.balanceOf(beneficiary)
        beneficiaryBalanceAfter.should.be.bignumber.equal(initialBeneficiaryBalance.add(amount).sub(fee))

        const transactorBalance = await token.balanceOf(txMaker)
        transactorBalance.should.be.bignumber.equal(fee)

        // Copy into public var to be used in next test
        withdrawalRequest = request
    })

    it("should be not possible to send same transaction twice", async () => {
        await channel.fastExit(withdrawalRequest.amount,
            withdrawalRequest.fee,
            withdrawalRequest.beneficiary,
            withdrawalRequest.validUntil,
            withdrawalRequest.identitySignature,
            withdrawalRequest.hermesSignature
        ).should.be.rejected
    })

    it("should be not possible to send transaction after validUntil block is passed", async () => {
        const beneficiary = otherAccounts[1]
        const lastBlockNumber = (await web3.eth.getBlock('latest')).number
        const nonce = 2
        const amount = 1

        const remainingBalance = await token.balanceOf(channel.address)
        expect(remainingBalance.toNumber()).to.be.greaterThan(amount)

        const request = signFastWithdrawal(ChainID, channel.address, amount, Zero, beneficiary, lastBlockNumber, nonce, identity, hermes)
        await channel.fastExit(request.amount,
            request.fee,
            request.beneficiary,
            request.validUntil,
            request.identitySignature,
            request.hermesSignature
        ).should.be.rejected
    })
})
