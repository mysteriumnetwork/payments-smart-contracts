// Reference/Minimal client implementation to work with channels
const assert = require('assert')
const { BN } = require('openzeppelin-test-helpers')
const {
    privateToPublic,
    toAddress,
    signMessage,
    verifySignature,
    toBytes32Buffer,
} = require('./utils.js')

// const TestContract = artifacts.require("TestContract")
const OneToken = web3.utils.toWei(new BN(1), 'ether')

async function getChannelState(channel) {
    const identityBalance = await channel.identityBalance()
    const hubBalance = await channel.hubBalance()
    const totalBalance = identityBalance.add(hubBalance)
    return {
        identityAddress: (await channel.identityHash()).toLowerCase(),
        hubAddress: (await channel.hubId()).toLowerCase(),
        sequence: await channel.lastSequence(),
        identityBalance,
        hubBalance,
        totalBalance
    }
}

// REBALANCE_PREFIX, _identityBalance, _hubBalance, _sequence
function signChannelState(requesterKey, msg) {
    const REBALANCE_PREFIX = Buffer.from("Rebalancing channel balances:")
    const message = Buffer.concat([REBALANCE_PREFIX, msg])
    const signature = signMessage(message, requesterKey)

    // verify the signature
    const publicKey = privateToPublic(requesterKey)
    expect(verifySignature(message, signature, publicKey)).to.be.true

    return signature
}

// channel = {partyAddress: amount, sequence}
// returns {newState, receiverSignature}
async function requestPayment(requesterKey, amount = 0.5, channel) {
    const requester = toAddress(privateToPublic(requesterKey))
    const state = await getChannelState(channel)
    assert(requester === state.identityAddress || requester === state.hubAddress)
    
    const sequence = increaseSequence(state.sequence)
    const amountInWei = BN.isBN(amount) 
        ? amount
        : (new BN((OneToken * amount).toString()))

    if (requester === state.identityAddress) {
        const identityBalance = state.identityBalance.add(amountInWei)
        const hubBalance = state.hubBalance.sub(amountInWei)
        const message = Buffer.concat([
            toBytes32Buffer(identityBalance),
            toBytes32Buffer(hubBalance),
            toBytes32Buffer(sequence)
        ])
        return {
            state: Object.assign({}, state, {identityBalance, hubBalance}), 
            signature: signChannelState(requesterKey, message)
        }
    } else {
        const hubBalance = state.hubBalance.add(amountInWei)
        const identityBalance = state.identityBalance.sub(amountInWei)
        const message = Buffer.concat([
            toBytes32Buffer(identityBalance),
            toBytes32Buffer(hubBalance),
            toBytes32Buffer(sequence)
        ])
        return {
            state: Object.assign({}, state, {identityBalance, hubBalance, sequence}), 
            signature: signChannelState(requesterKey, message)
        }
    }
}

async function requestWithdrawal(requesterKey, amount, timeout, channel) {
    const requester = toAddress(privateToPublic(requesterKey))
    const state = await getChannelState(channel)
    assert(requester === state.identityAddress || requester === state.hubAddress)

    const sequence = increaseSequence(state.sequence)
    const now = await channel.getNow()
    const deadline = new BN(now + timeout)
    const amountInWei = BN.isBN(amount) ? amount : (new BN((OneToken * amount).toString()))
    const totalBalance = state.totalBalance.sub(amountInWei)

    let identityBalance, identityWithdraw, hubBalance, hubWithdraw
    if (requester === state.identityAddress) {
        assert(state.identityBalance.gte(amountInWei))
        identityBalance = state.identityBalance.sub(amountInWei)
        identityWithdraw = amountInWei
        hubBalance = state.hubBalance
        hubWithdraw = new BN(0)
    } else {
        assert(state.hubBalance.gte(amountInWei))
        hubBalance = state.hubBalance.sub(amountInWei)
        hubWithdraw = amountInWei
        identityBalance = state.identityBalance
        identityWithdraw = new BN(0)
    }

    const message = Buffer.concat([
        toBytes32Buffer(identityBalance),
        toBytes32Buffer(hubBalance),
        toBytes32Buffer(identityWithdraw),
        toBytes32Buffer(hubWithdraw),
        toBytes32Buffer(sequence),
        toBytes32Buffer(deadline)
    ])

    return {
        state: Object.assign({}, state, {identityBalance, hubBalance, totalBalance, identityWithdraw, hubWithdraw, sequence, deadline}),
        signature: signChannelState(requesterKey, message)
    }
}

// TODO add validation before signing
function signPaymentRequest(signature, state) {
    const message = Buffer.concat([
        toBytes32Buffer(state.identityBalance),
        toBytes32Buffer(state.hubBalance),
        toBytes32Buffer(state.sequence)
    ])
    return signChannelState(signature, message)
}

// TODO add validation before signing
function signWithdrawRequest(signature, state) {
    const message = Buffer.concat([
        toBytes32Buffer(state.identityBalance),
        toBytes32Buffer(state.hubBalance),
        toBytes32Buffer(state.identityWithdraw),
        toBytes32Buffer(state.hubWithdraw),
        toBytes32Buffer(state.sequence),
        toBytes32Buffer(state.deadline)
    ])
    return signChannelState(signature, message)
}

function increaseSequence(sequence) {
    assert(BN.isBN(sequence))
    return sequence.add(new BN(1))
}

module.exports = {
    requestPayment,
    requestWithdrawal,
    signPaymentRequest,
    signWithdrawRequest
}
