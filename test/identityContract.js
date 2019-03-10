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

contract('Identity Contract full flow', ([_, owner, ...otherAccounts]) => {
    let token, dex, registry
    before(async () => {
        token = await MystToken.new()

        const dexImplementation = await MystDex.new()
        const identityImplementation = await IdentityImplementation.new(token.address, dexImplementation.address, owner, OneEther)
        dex = await MystDex.at(await identityImplementation.address)
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
        const identityContract = await IdentityImplementation.at(await genCreate2Address(identityHash, registry))
        const SETTLE_PREFIX = Buffer.from("Settlement request:")
        const receiverAccount = otherAccounts[1]
        const receiverAccountBuffer = Buffer.from(receiverAccount.slice(2), 'hex')
        const amount = setLengthLeft(OneToken.div(new BN(2)).toBuffer(), 32) // 0.5 tokens
        const fee = setLengthLeft(Buffer.from('00', 'hex'), 32)              // zero fee
        const extraDataHash = keccak('')                                     // no extra data
        
        // sign the message
        const message = Buffer.concat([SETTLE_PREFIX, receiverAccountBuffer, amount, fee, extraDataHash])
        const signature = signMessage(message, privKey)

        // verify the signature
        expect(verifySignature(message, signature, pubKey)).to.be.true

        // withdraw some tokens using 'checkque'
        expect(Number(await token.balanceOf(receiverAccount))).to.be.equal(0)

        await identityContract.withdraw(
            receiverAccount, 
            amount,
            `0x${signature.toString('hex')}`
        );

        (await token.balanceOf(receiverAccount)).should.be.bignumber.equal(new BN(amount))
    })
})
