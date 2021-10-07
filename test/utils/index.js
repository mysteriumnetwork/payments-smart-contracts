const secp256k1 = require('secp256k1')
const ethUtils = require('ethereumjs-util')
const rlp = require('rlp')
const { randomBytes } = require('crypto')
const BN = require('bn.js')

const IUniswapV2Router = artifacts.require("IUniswapV2Router")

const deployRouter02Tx = require('../../scripts/UniswapV2Router02.json')
const OneToken = web3.utils.toWei(new BN('1000000000000000000'), 'wei')
const HalfETH = web3.utils.toWei(new BN('500000000000000000'), 'wei')

// CREATE2 address is calculated this way:
// keccak("0xff++msg.sender++salt++keccak(byteCode)")
async function genCreate2Address(identityHash, hermesId, registry, implementationAddress) {
    const byteCode = (await registry.getProxyCode(implementationAddress))
    const salt = web3.utils.keccak256('0x' + [identityHash.replace(/0x/, ''), hermesId.replace(/0x/, '')].join('').toLowerCase())
    return `0x${web3.utils.keccak256(`0x${[
        'ff',
        registry.address.replace(/0x/, ''),
        salt.replace(/0x/, ''),
        web3.utils.keccak256(byteCode).replace(/0x/, '')
    ].join('')}`).slice(-40)}`.toLowerCase()
}

// Generates provider's channelId in hermes smart contract
function generateChannelId(party, hermesId, type = '') {
    return `0x${ethUtils.keccak(Buffer.concat([
        Buffer.from(party.slice(2), 'hex'),
        Buffer.from(hermesId.slice(2), 'hex'),
        Buffer.from(type)]
    )).toString('hex')}`
}

function generatePrivateKey() {
    let privKey
    do {
        privKey = randomBytes(32)
    } while (!secp256k1.privateKeyVerify(privKey))

    return privKey
}

function privateToPublic(privKey) {
    return ethUtils.privateToPublic(privKey)
}

function toAddress(pubKey) {
    const hash = ethUtils.keccak(pubKey).slice(-20)
    return `0x${hash.toString('hex')}`
}

// Returns signature as 65 bytes Buffer in format of `r` (32 bytes), `s` (32 bytes), `v` (1 byte)
function signMessage(message, privKey) {
    const messageHash = ethUtils.keccak(message)
    const sigObj = secp256k1.ecdsaSign(messageHash, privKey)
    return Buffer.concat([
        sigObj.signature,
        Buffer.from((sigObj.recid + 27).toString(16), 'hex')
    ])

    // Alternative implementatino using ethereumjs-util
    // const { r, s, v } = ethUtils.ecsign(messageHash, privKey)
    // return Buffer.from([r.toString('hex'), s.toString('hex'), v.toString(16)].join(''), 'hex')
}

function verifySignature(message, signature, pubKey) {
    if (pubKey.length >= 64 && pubKey[0].toString(16) !== '04') {
        // pubkey = Buffer.from(`04${pubKey.toString('hex')}`, 'hex')
        pubKey = Buffer.concat([Buffer.from('04', 'hex'), pubKey])
    }

    if (signature.constructor.name !== 'Uint8Array') {
        signature = new Uint8Array(signature.slice(0, 64))
    }

    const messageHash = ethUtils.keccak(message)
    return secp256k1.ecdsaVerify(signature, messageHash, pubKey)
}

// Derive address of smart contract created by creator.
function deriveContractAddress(creator, nonce = 0) {
    const input = [creator, nonce]
    const rlp_encoded = rlp.encode(input)
    return toAddress(rlp_encoded)
}

// Topup given amount of ethers into give to address
async function topUpEthers(from, to, value) {
    const initialBalance = new BN(await web3.eth.getBalance(to))
    await web3.eth.sendTransaction({ from, to, value })

    const expectedBalance = initialBalance.add(new BN(value.toString()))
    expect(await web3.eth.getBalance(to)).to.be.equal(expectedBalance.toString())
}

// Mint some tokens
async function topUpTokens(token, to, amount) {
    const initialBalance = new BN(await token.balanceOf(to))
    await token.mint(to, amount.toString())

    const expectedBalance = initialBalance.add(new BN(amount.toString()))
    expectedBalance.should.be.bignumber.equal(await token.balanceOf(to))
}

// Setup WETH-Token trading pair liquidity on uniswap compatible dex
async function setupDEX(token, txMaker) {
    // Map with abi
    const dex = await IUniswapV2Router.at(deployRouter02Tx.contractAddr)

    // Setup traiding pair and provide liquidity (if there is none)
    if ((await token.balanceOf(deployRouter02Tx.contractAddr)).toNumber() === 0) {
        const farFuture = 2147483646 // year 2038, end of unix time epoch
        await topUpTokens(token, txMaker, OneToken)
        await token.approve(dex.address, OneToken)

        await dex.addLiquidityETH(token.address, OneToken, OneToken, HalfETH, txMaker, farFuture, {
            from: txMaker,
            value: HalfETH
        })
    }
    return dex
}

function toBytes32Buffer(item, type) {
    if (item.constructor.name === 'Buffer') {
        return item
    }

    if (type === 'address') {
        item = new BN(item.replace(/0x/, ''), 16)
    }

    if (typeof item === 'number' || typeof item === 'string') {
        item = new BN(item)
    }

    return ethUtils.setLengthLeft(item.toBuffer(), 32)
}

function to16BitsBuffer(item) {
    if (typeof item === 'number' || typeof item === 'string') {
        item = new BN(item)
    }

    return ethUtils.setLengthLeft(item.toBuffer(), 2)
}

function toBuffer(item) {
    if (item instanceof Buffer)
        return item

    switch (typeof item) {
        case 'object':
            if (item.constructor.name === 'BN')
                return toBytes32Buffer(item)
            else
                throw "Unknown type of given item"
        case 'number':
            return toBytes32Buffer(new BN(item))
        case 'string':
            return Buffer.from(item.slice(2), 'hex')
    }
}

function calcFee(amount, fee = new BN(0)) {
    if (amount.constructor.name !== 'BN')
        amount = new BN(fee)

    return amount.mul(fee).div(new BN(10000))
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    genCreate2Address,
    generateChannelId,
    generatePrivateKey,
    privateToPublic,
    getIdentityHash: toAddress,
    toAddress,
    signMessage,
    verifySignature,
    deriveContractAddress,
    topUpEthers,
    topUpTokens,
    setupDEX,
    keccak: ethUtils.keccak,
    setLengthLeft: ethUtils.setLengthLeft,
    to16BitsBuffer,
    toBytes32Buffer,
    toBuffer,
    calcFee,
    sleep
}
