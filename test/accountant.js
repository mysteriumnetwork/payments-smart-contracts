/*
    This test is testing uni-directional, promise based accountant hub payment multi channel implementation.
    Smart-contract code can be found in `contracts/AccountantImplementation.sol`.
*/

const { BN } = require('openzeppelin-test-helpers')
const { 
    generateChannelId,
    topUpTokens,
    topUpEthers,
    keccak
} = require('./utils/index.js')
const wallet = require('./utils/wallet.js')
const { signChannelOpening } = require('./utils/client.js')

const MystToken = artifacts.require("MystToken")
const MystDex = artifacts.require("MystDEX")
const Registry = artifacts.require("Registry")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const OneToken = OneEther = web3.utils.toWei(new BN(1), 'ether')

contract('Accountant Contract Implementation tests', ([txMaker, beneficiaryA, beneficiaryB, beneficiaryC, ...otherAccounts]) => {
    const operator = wallet.generateAccount()   // Generate accountant operator wallet
    const identityA = wallet.generateAccount()
    const identityB = wallet.generateAccount()
    const identityC = wallet.generateAccount()

    let token, accountant, registry
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
        accountantTokenBalance.should.be.bignumber.equal(amountToLend)

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
        expect(availableBalance.toNumber()).to.be.equal(0)
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
        expect(availableBalance.toNumber()).to.be.equal(0)
    })

    /**
     * Testing promise settlement functionality
     */


})