/*
    Reference/Minimal client implementation to work with uni-directional payment channels
*/

const assert = require('assert')
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')
const {
    privateToPublic,
    toAddress,
    signMessage,
    verifySignature,
    toBytes32Buffer,
    toBuffer,
    keccak
} = require('./index.js')

// const TestContract = artifacts.require("TestContract")
const OneToken = web3.utils.toWei(new BN(1), 'ether')

function generatePromise(amountToPay, fee, channelState, operator) {
    const amount = channelState.settled.add(amountToPay).add(fee) // we're signing always increasing amount to settle
    const R = randomBytes(32)
    const hashlock = keccak(R)
    const extraDataHash = keccak("")
    const message = Buffer.concat([
        Buffer.from(channelState.channelId.slice(2), 'hex'),  // channelId = channel address
        toBytes32Buffer(amount),   // total promised amount in this channel
        toBytes32Buffer(fee),      // fee to transfer for msg.sender
        hashlock,     // hashlock needed for HTLC scheme
        extraDataHash // hash of related data
    ])

    // sign and verify the signature
    const signature = signMessage(message, operator.privKey)
    expect(verifySignature(message, signature, operator.pubKey)).to.be.true
    
    return { amount, fee, lock: R, extraDataHash, signature }
}

async function signExitRequest(channel, beneficiary, operator) {
    const EXIT_PREFIX = "Exit request:"
    // const DELAY_BLOCKS = (await channel.DELAY_BLOCKS()).toNumber()
    const lastBlockNumber = (await web3.eth.getBlock('latest')).number
    const validUntil = lastBlockNumber + 4//DELAY_BLOCKS

    const message = Buffer.concat([
        Buffer.from(EXIT_PREFIX),
        Buffer.from(channel.address.slice(2), 'hex'),  // channelId = channel address
        Buffer.from(beneficiary.slice(2), 'hex'),
        toBytes32Buffer(new BN(validUntil))
    ])

    // sign and verify the signature
    const signature = signMessage(message, operator.privKey)
    expect(verifySignature(message, signature, operator.pubKey)).to.be.true

    return {
        channelId: channel.toAddress,
        beneficiary,
        validUntil,
        signature
    }
}

// We're using signature as bytes array (`bytes memory`), so we have properly construct it.
function serialiseSignature(signature) {
    const bytesArrayPosition = toBytes32Buffer(new BN(160))
    const bytesArrayLength = toBytes32Buffer(new BN(65))
    const bytesArrayFooter = Buffer.from('00000000000000000000000000000000000000000000000000000000000000', 'hex')

    return Buffer.concat([
        bytesArrayPosition,
        bytesArrayLength,
        toBuffer(signature),
        bytesArrayFooter
    ])
}

function constructPayload(obj) {
    // Convert signature into `bytes memory`
    if (obj.signature)
        obj.signature = serialiseSignature(obj.signature)

    const methodNameHash = '0x8e24280c' // settlePromise(uint256,uint256,bytes32,bytes32,bytes memory)
    const message = Buffer.concat(Object.keys(obj).map(key => toBuffer(obj[key])))
    return methodNameHash + message.toString('hex')
}

module.exports = {
    generatePromise,
    signExitRequest,
    constructPayload
}
