// Client software to work with channels
const assert = require('assert')
const { BN } = require('openzeppelin-test-helpers')
const {
    privateToPublic,
    toAddress,
    signMessage,
    verifySignature,
    toBytes32Buffer,
} = require('./utils.js')

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
function signChannelState(requesterKey, identityBalance, hubBalance, sequence) {
    const REBALANCE_PREFIX = Buffer.from("Rebalancing channel balances:")
    const message = Buffer.concat([
        REBALANCE_PREFIX,
        toBytes32Buffer(identityBalance),
        toBytes32Buffer(hubBalance),
        toBytes32Buffer(sequence)
    ])
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
        return {
            state: Object.assign({}, state, {identityBalance, hubBalance}), 
            signature: signChannelState(requesterKey, identityBalance, hubBalance, sequence)
        }
    } else {
        const hubBalance = state.hubBalance.add(amountInWei)
        const identityBalance = state.identityBalance.sub(amountInWei)
        return {
            state: Object.assign({}, state, {identityBalance, hubBalance, sequence}), 
            signature: signChannelState(requesterKey, identityBalance, hubBalance, sequence)
        }
    }
}

// TODO add validation before payment
function signPaymentRequest(signature, state) {
    return signChannelState(signature, state.identityBalance, state.hubBalance, state.sequence)
}

function increaseSequence(sequence) {
    assert(BN.isBN(sequence))
    return sequence.add(new BN(1))
}

module.exports = {
    requestPayment,
    signPaymentRequest
}
