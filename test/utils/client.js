/*
    Reference/Minimal client implementation to work with uni-directional payment channels
*/

const assert = require('assert')
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')
const {
    signMessage,
    verifySignature,
    toBytes32Buffer,
    toBuffer,
    keccak
} = require('./index.js')

const ChannelImplementation = artifacts.require("ChannelImplementation")

// const TestContract = artifacts.require("TestContract")
const OneToken = web3.utils.toWei(new BN(1), 'ether')

// State stored by Provider
// Invoices will store agreement IDs (as key), total payed and generated random `R` number
const invoices = {
    "invoiceId": {
        agreementID: 1,
        agreementTotal: 0,
        r: 'abc',
        // paid: false,
        exchangeMessage: {}
    }
}

const agreements = {
    'agreementID': 0 // total amount of this agreement
}

// State stored by Accountant
const channels = {
    // 'channelID': {
    //     settled: 0,
    //     balance: 0,
    //     promised: 0,
    //     agreements: {
    //         'agreementID': 0
    //     }
    // }
}

const DEFAULT_CHANNEL_STATE = {
    settled: new BN(0),
    balance: new BN(0),
    promised: new BN(0),
    agreements: {}
}


function generateInvoice(amount, agreementId, fee = new BN(0)) {
    const R = randomBytes(32)
    const hashlock = keccak(R)
 
    // amount have to be bignumber
    if(typeof amount === 'number') amount = new BN(amount)

    // If no agreement id is given, then it's new one
    if (!agreementId) {
        agreementId = randomBytes(32)
        agreements[agreementId] = new BN(0)
    }

    agreements[agreementId] = agreements[agreementId].add(amount)

    // save invoice
    invoices[hashlock] = {R, agreementId, agreementTotal: agreements[agreementId], fee}

    return invoices[hashlock]
}

function validateInvoice(hashlock, agreementId, agreementTotal) {
    const invoice = invoices[hashlock]
    expect(agreementId).to.be.equal(invoice.agreementId)
    agreementTotal.should.be.bignumber.equal(invoice.agreementTotal)
}

function createExchangeMsg(invoice, party, channelId, operator) {
    const agreementId = invoice.agreementId
    const agreementTotal = invoice.agreementTotal
    const channelState = channels[channelId] || DEFAULT_CHANNEL_STATE

    // TODO: recheck this stuff. Should it really use agreementTotal?
    const amount = channelState.settled.add(agreementTotal).add(invoice.fee) // we're signing always increasing amount to settle
    const hashlock = keccak(invoice.R)
    const extraDataHash = keccak(agreementId)
    const promise = createPromise(channelId, amount, invoice.fee, hashlock, extraDataHash, operator)

    // Create and sign exchange message
    const message = Buffer.concat([
        promise.hash,
        agreementId,
        toBytes32Buffer(agreementTotal),
        Buffer.from(party.slice(2), 'hex')
    ])
    const signature = signMessage(message, operator.privKey)

    return {promise, agreementId, agreementTotal, party, hash: keccak(message), signature}
}

function validateExchangeMessage(exchangeMsg, payerPubKey, receiver) {
    const { promise, agreementId, agreementTotal, party, signature } = exchangeMsg

    // Signature have to be valid
    const message = Buffer.concat([
        promise.hash,
        agreementId,
        toBytes32Buffer(agreementTotal),
        Buffer.from(party.slice(2), 'hex')
    ])
    expect(verifySignature(message, signature, payerPubKey)).to.be.true
    expect(receiver).to.be.equal(party)

    validatePromise(promise, payerPubKey)
    validateInvoice(promise.hashlock, agreementId, agreementTotal)
}

// TODO Can we avoid payerPubKey as he already known from promise... ?
async function exchangePromise(exchangeMessage, payerPubKey, receiver, channelId, accountant, operator, token) {
    validateExchangeMessage(exchangeMessage, payerPubKey, receiver)

    const { promise, agreementId, agreementTotal } = exchangeMessage

    if (!channels[channelId]) {
        const channel = await ChannelImplementation.at(channelId)    
        channels[channelId] = Object.assign({}, await channel.party(), { 
            balance: await token.balanceOf(channelId),
            promised: new BN(0),
            agreements: {[agreementId]: new BN(0)} 
        })
    }
    const channelState = channels[channelId]

    // amount not covered by previous payment promises should be bigger than balance
    const amount = agreementTotal.sub(channelState.agreements[agreementId])
    channelState.balance.should.be.bignumber.gte(amount)

    // Amount in promise should be set properly
    promise.amount.should.be.bignumber.equal(channelState.promised.add(amount))

    // Save updated channel state
    channelState.balance = channelState.balance.sub(amount)
    channelState.agreements[agreementId].add(amount)
    channelState.promised = channelState.promised.add(amount)

    // Update outgoing channel state
    const outgoingChannelId = await accountant.getChannelId(receiver)
    expect(await accountant.isOpened(outgoingChannelId)).to.be.true

    if (!channels[outgoingChannelId]) {
        channels[outgoingChannelId] = Object.assign({}, DEFAULT_CHANNEL_STATE, await accountant.channels(outgoingChannelId))
    }

    const promiseAmount = channels[outgoingChannelId].promised.add(amount)
    channels[outgoingChannelId].promised = promiseAmount

    // Issue new payment promise for `amount` value
    return createPromise(outgoingChannelId, promiseAmount, new BN(0), promise.hashlock, promise.extraDataHash, operator)
}

function generatePromise(amountToPay, fee, channelState, operator) {
    const amount = channelState.settled.add(amountToPay).add(fee) // we're signing always increasing amount to settle
    const R = randomBytes(32)
    const hashlock = keccak(R)
    const extraDataHash = keccak("")
    return Object.assign({}, 
        createPromise(channelState.channelId, amount, fee, hashlock, extraDataHash, operator),
        {lock: R}
    )
}

function createPromise(channelId, amount, fee, hashlock, extraDataHash, operator) {
    const message = Buffer.concat([
        Buffer.from(channelId.slice(2), 'hex'),  // channelId = channel address
        toBytes32Buffer(amount),   // total promised amount in this channel
        toBytes32Buffer(fee),      // fee to transfer for msg.sender
        hashlock,     // hashlock needed for HTLC scheme
        extraDataHash // hash of related data
    ])

    // sign and verify the signature
    const signature = signMessage(message, operator.privKey)
    expect(verifySignature(message, signature, operator.pubKey)).to.be.true
    
    return { channelId, amount, fee, hashlock, extraDataHash, hash: keccak(message), signature }
}

function validatePromise(promise, pubKey) {
    const message = Buffer.concat([
        Buffer.from(promise.channelId.slice(2), 'hex'),  // channelId = channel address
        toBytes32Buffer(promise.amount),   // total promised amount in this channel
        toBytes32Buffer(promise.fee),      // fee to transfer for msg.sender
        promise.hashlock,     // hashlock needed for HTLC scheme
        promise.extraDataHash // hash of related data
    ])

    expect(verifySignature(message, promise.signature, pubKey)).to.be.true 
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

function signChannelOpening(accountantId, party, beneficiary, amountToLend = 0) {
    const OPENCHANNEL_PREFIX = "Open channel request"

    const message = Buffer.concat([
        Buffer.from(OPENCHANNEL_PREFIX),
        Buffer.from(accountantId.slice(2), 'hex'),
        Buffer.from(party.address.slice(2), 'hex'),
        Buffer.from(beneficiary.slice(2), 'hex'),
        toBytes32Buffer(amountToLend)
    ])

    // sign and verify the signature
    const signature = signMessage(message, party.privKey)
    expect(verifySignature(message, signature, party.pubKey)).to.be.true

    return signature
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
    constructPayload,
    createExchangeMsg,
    exchangePromise,
    generatePromise,
    generateInvoice,
    signExitRequest,
    signChannelOpening,
    validateExchangeMessage,
    validatePromise
}
