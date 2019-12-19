const secp256k1 = require('secp256k1')
const ethUtils = require('ethereumjs-util')
const rlp = require('rlp')
const { randomBytes } = require('crypto')
const { BN } = require('openzeppelin-test-helpers')
const leftPad = require('left-pad')
const deployConfig = require('../../scripts/deployConfig').deploy

const Config = artifacts.require("Config")
const ChannelImplementation = artifacts.require("ChannelImplementation")

// CREATE2 address is calculated this way:
// keccak("0xff++msg.sender++salt++keccak(byteCode)")
async function genCreate2Address(identityHash, accountantId, registry, implementationAddress) {
    const byteCode = (await registry.getProxyCode(implementationAddress))
    const salt = web3.utils.keccak256('0x' + [identityHash.replace(/0x/, ''), accountantId.replace(/0x/, '')].join('').toLowerCase())
    return `0x${web3.utils.keccak256(`0x${[
        'ff',
        registry.address.replace(/0x/, ''),
        salt.replace(/0x/, ''),
        web3.utils.keccak256(byteCode).replace(/0x/, '')
    ].join('')}`).slice(-40)}`.toLowerCase()
}

// Generates provider's channelId in accountant smart contract
function generateChannelId(party, accountantId) {
    return `0x${ethUtils.keccak(Buffer.concat([
        Buffer.from(party.slice(2), 'hex'),
        Buffer.from(accountantId.slice(2), 'hex')]
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
    const sigObj = secp256k1.sign(messageHash, privKey)
    return Buffer.concat([
        sigObj.signature,
        Buffer.from((sigObj.recovery + 27).toString(16), 'hex')
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

    const messageHash = ethUtils.keccak(message)
    return secp256k1.verify(messageHash, signature.slice(0, 64), pubKey)
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

function toBytes32Buffer(item, type) {
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
            if (item instanceof BN)
                return toBytes32Buffer(item)
            else
                throw "Unknown type of given item"
        case 'number':
            return toBytes32Buffer(new BN(item))
        case 'string':
            return Buffer.from(item.slice(2), 'hex')
    }
}

async function setupConfig(owner, channelProxy, accountantImplementation) {
    const channelImplementation = (await ChannelImplementation.new()).address

    const configAddress = await deployConfig(web3, owner)
    const config = await Config.at(configAddress)

    await config.setOwner(owner)

    const channelSlot = '0x48df65c92c1c0e8e19a219c69bfeb4cf7c1c123e0c266d555abb508d37c6d96e'    // keccak256('channel implementation')
    const channelImplAddressBytes = '0x' + leftPad((channelImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(channelSlot, channelImplAddressBytes)

    const channelProxySlot = '0x2ef7e7c50e1b6a574193d0d32b7c0456cf12390a0872cf00be4797e71c3756f7' // keccak256('channel implementation proxy')
    const channelProxyAddressBytes = '0x' + leftPad((channelProxy.slice(2)).toString(16), 64, 0)
    await config.addConfig(channelProxySlot, channelProxyAddressBytes)

    const accountantSlot = '0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0' // keccak256('accountant implementation')
    const AccImplAddressBytes = '0x' + leftPad((accountantImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(accountantSlot, AccImplAddressBytes)

    return config
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
    keccak: ethUtils.keccak,
    setLengthLeft: ethUtils.setLengthLeft,
    to16BitsBuffer,
    toBytes32Buffer,
    toBuffer,
    setupConfig
}
