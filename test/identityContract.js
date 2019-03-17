const { BN } = require('openzeppelin-test-helpers')
const { 
    genCreate2Address,
    generatePrivateKey,
    privateToPublic,
    getIdentityHash,
    signMessage,
    verifySignature,
    setLengthLeft,
    keccak } = require('./utils.js')

const MystToken = artifacts.require("MystToken")
const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystDex = artifacts.require("MystDEX")

// Generate identity
const privKey = generatePrivateKey()
const pubKey = privateToPublic(privKey)
const identityHash = getIdentityHash(pubKey)

const OneToken = web3.utils.toWei(new BN(1), 'ether')
const OneEther = web3.utils.toWei('1', 'ether')

function createCheque(privateKey, receiverAccount, amount = 0.5, fee = 0, extraData = '') {
    const SETTLE_PREFIX = Buffer.from("Settlement request:")
    const amountInWei = BN.isBN(amount) 
        ? setLengthLeft(amount.toBuffer(), 32)
        : setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32)
    const feeInWei = (fee === 0) 
        ? setLengthLeft(Buffer.from('00', 'hex'), 32)
        : setLengthLeft((new BN((OneToken * fee).toString())).toBuffer(), 32)
    const extraDataHash = keccak(extraData)
    const receiver = Buffer.from(receiverAccount.slice(2), 'hex')
    
    const message = Buffer.concat([SETTLE_PREFIX, receiver, amountInWei, feeInWei, extraDataHash])
    const signature = signMessage(message, privateKey)
    
    // verify the signature
    const publicKey = privateToPublic(privateKey)
    expect(verifySignature(message, signature, publicKey)).to.be.true

    return signature
}

async function getContract(identityHash, registry) {
    return await IdentityImplementation.at(await genCreate2Address(identityHash, registry))
}

contract('Identity Contract full flow', ([txMaker, owner, ...otherAccounts]) => {
    let token, registry
    before(async () => {
        token = await MystToken.new()
        const dexImplementation = await MystDex.new()
        const identityImplementation = await IdentityImplementation.new(token.address, dexImplementation.address, owner, OneEther)
        registry = await IdentityRegistry.new(token.address, OneToken, identityImplementation.address)
    })

    it("should fail registering identity without paying registration fee", async () => {
        await registry.registerIdentity(identityHash).should.be.rejected
    })

    it("should register identity by paying fee", async () => {
        const userAccount = otherAccounts[0]

        // Mint 100 tokens into user account
        const tokensToMint = OneToken.mul(new BN(100))
        await token.mint(userAccount, tokensToMint)
        const userTokenBalance = await token.balanceOf(userAccount)
        userTokenBalance.should.be.bignumber.equal(tokensToMint)

        // Approve registry to use tokens
        await token.approve(registry.address, OneToken, {from: userAccount})

        // Register identity
        await registry.registerIdentity(identityHash, {from: userAccount})
        expect(await registry.isRegistered(identityHash)).to.be.true
    })

    it("should be abble to topup identity contract address", async () => {
        const userAccount = otherAccounts[0]
        const identityContractAddress = await genCreate2Address(identityHash, registry)
        const amount = OneToken.mul(new BN(8)) // 8 full tokens
        
        await token.transfer(identityContractAddress, amount, {from: userAccount})
        identityContractBalance = await token.balanceOf(identityContractAddress)
        identityContractBalance.should.be.bignumber.equal(amount)
    })

    it("should be able to withdraw some tokens", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[1]
        const amount = 0.5
        const fee = 0
        
        // sign the message
        const signature = createCheque(privKey, receiverAccount, amount, fee)

        // withdraw some tokens using 'checkque'
        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(0)

        await identityContract.withdraw(
            receiverAccount, 
            setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32),
            `0x${signature.toString('hex')}`
        )

        const receiverBalance = await token.balanceOf(receiverAccount)
        receiverBalance.should.be.bignumber.equal(new BN('500000000000000000'))
    })

    it("not allowed to withdraw funds by signing wrong params", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[2]
        const amount = 0.5
        const fee = 0

        // sign the message
        const signature = createCheque(privKey, receiverAccount, amount, fee, 'redundant extra data')

        // should reject withdraw tokens using signature created from wrong params
        await identityContract.withdraw(
            receiverAccount, 
            setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32),
            `0x${signature.toString('hex')}`
        ).should.be.rejected

        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(0)
    })

    it("should not allow to withdraw when signature is not matching contract's identity", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[3]
        const amount = 0.5
        const fee = 0
        
        // sign the message
        const fakePrivKey = generatePrivateKey()
        const signature = createCheque(fakePrivKey, receiverAccount, amount, fee)

        // withdraw should fail
        await identityContract.withdraw(
            receiverAccount, 
            setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32),
            `0x${signature.toString('hex')}`
        ).should.be.rejected

        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(0)
    })

    it("should settle given amount of tokens", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[4]
        const amount = 0.25
        const fee = 0
        const extraData = 'any extra data'

        // sign the message
        const signature = createCheque(privKey, receiverAccount, amount, fee, extraData)

        // settle some tokens using 'checkque'
        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(0)

        await identityContract.settlePromise(
            receiverAccount, 
            setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32),
            setLengthLeft(Buffer.from('00', 'hex'), 32),
            `0x${keccak(extraData).toString('hex')}`, // zero fee
            `0x${signature.toString('hex')}`
        );

        (await token.balanceOf(receiverAccount)).should.be.bignumber.equal(new BN((OneToken * amount).toString()))
    })

    it("when there is not enought tokens, it should settle as much tokens as possible", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[5]
        const balance = await token.balanceOf(identityContract.address)  // 7.25 tokens
        const amount = balance.add(new BN(2))   // amount is 2 tokens bigger than identity balance

        // sign the message
        const signature = createCheque(privKey, receiverAccount, amount)

        // settling more tokens than possible should settle as much as possible
        await identityContract.settlePromise(
            receiverAccount, 
            setLengthLeft(amount.toBuffer(), 32),
            setLengthLeft(Buffer.from('00', 'hex'), 32), // zero fee
            `0x${keccak('').toString('hex')}`,           // no extra data
            `0x${signature.toString('hex')}`
        );

        (await token.balanceOf(receiverAccount)).should.be.bignumber.equal(balance);
        expect(Number(await token.balanceOf(identityContract.address))).to.be.equal(0)
    })

    it("should be possible to apply same signature twice", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[5]
        const amount = new BN('7250000000000000002') // amount is same as in previous cheque

        // Top up identity contract
        await token.mint(identityContract.address, 10)
        expect(Number(await token.balanceOf(identityContract.address))).to.be.equal(10)

        // create same signature as in previouse test
        const signature = createCheque(privKey, receiverAccount, amount)

        // settle unsettled part of tokens (2 wei in our case)
        await identityContract.settlePromise(
            receiverAccount, 
            setLengthLeft(amount.toBuffer(), 32),
            setLengthLeft(Buffer.from('00', 'hex'), 32), // zero fee
            `0x${keccak('').toString('hex')}`,           // no extra data
            `0x${signature.toString('hex')}`
        );

        (await token.balanceOf(receiverAccount)).should.be.bignumber.equal(amount)
        expect(Number(await token.balanceOf(identityContract.address))).to.be.equal(8)
    })

    it("transaction maker should get fee", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[6]
        const amount = 0.25
        const fee = 0.01

        // Top up identity contract
        const initialBalance = await token.balanceOf(identityContract.address)
        await token.mint(identityContract.address, OneToken)
        const newBalance = await token.balanceOf(identityContract.address)
        const expectedBalance = OneToken.add(initialBalance)
        newBalance.should.be.bignumber.equal(expectedBalance)

        // sign cheque
        const signature = createCheque(privKey, receiverAccount, amount, fee)

        // in the beginning transaction maker don't ownes tokens
        expect(Number(await token.balanceOf(txMaker))).to.be.equal(0)

        // settle promise
        await identityContract.settlePromise(
            receiverAccount, 
            setLengthLeft((new BN((OneToken * amount).toString())).toBuffer(), 32),
            setLengthLeft((new BN((OneToken * fee).toString())).toBuffer(), 32),
            `0x${keccak('').toString('hex')}`,           // no extra data
            `0x${signature.toString('hex')}`
        )

        // transaction maker should get fee
        expect(Number(await token.balanceOf(txMaker))).to.be.equal(OneToken * fee)

        // receivers should get given amount of tokens excluding fee
        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(OneToken * (amount - fee))
    })

    it("should pay fee even when there are not enought tokens for full settlement", async () => {
        const identityContract = await getContract(identityHash, registry)
        const receiverAccount = otherAccounts[7]
        const identityBalance = await token.balanceOf(identityContract.address)
        const txMakerBalance = await token.balanceOf(txMaker)
        const amount = identityBalance.add(new BN(1))  // whole balance + one wei 
        const fee = 0.01  // 0.01 token

        // sign cheque
        const signature = createCheque(privKey, receiverAccount, amount, fee)

        // console.log('balance: ', identityBalance.toString())
        // console.log('paid   : ', (await identityContract.paidAmounts(receiverAccount)).toString())
        // console.log('amount : ', amount.toString())
        // console.log('fee    : ', fee * OneToken)

        // settle promise
        await identityContract.settlePromise(
            receiverAccount, 
            setLengthLeft(amount.toBuffer(), 32),
            setLengthLeft((new BN((OneToken * fee).toString())).toBuffer(), 32),
            `0x${keccak('').toString('hex')}`,           // no extra data
            `0x${signature.toString('hex')}`
        )

        // transaction maker should get fee
        const expectedBalance = Number(txMakerBalance) + Number(fee * OneToken)
        expect(Number(await token.balanceOf(txMaker))).to.be.equal(expectedBalance)

        // user should get rest of balance
        const receiverBalance = await token.balanceOf(receiverAccount)
        receiverBalance.should.be.bignumber.lessThan(amount)
        receiverBalance.should.be.bignumber.equal(identityBalance.sub(new BN((OneToken * fee).toString())))
    })
})
