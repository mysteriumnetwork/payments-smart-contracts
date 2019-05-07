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
    keccak
} = require('./index.js')

// const TestContract = artifacts.require("TestContract")
const OneToken = web3.utils.toWei(new BN(1), 'ether')

function generatePromise(amountToPay, fee, channelState, operator) {
    const amount = channelState.balance.add(amountToPay).add(fee) // we're signing always increasing amount to settle
    const R = randomBytes(32)
    const hashlock = keccak(R)
    const extraDataHash = keccak("")
    const message = Buffer.concat([
        Buffer.from(channelState.channelId.slice(2), 'hex'),  // channelId = channel address
        toBytes32Buffer(amount),   // total promised amount in this channel
        toBytes32Buffer(fee),      // fee to transfer for msg.sender
        Buffer.from(hashlock),     // hashlock needed for HTLC scheme
        Buffer.from(extraDataHash) // hash of related data
    ])

    // sign and verify the signature
    const signature = signMessage(message, operator.privKey)
    expect(verifySignature(message, signature, operator.pubKey)).to.be.true

    return { amount, fee, lock: R, extraDataHash, signature }
}

module.exports = {
    generatePromise
}
