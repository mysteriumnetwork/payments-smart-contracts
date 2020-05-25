/*
    Reference/Minimal client implementation to work with uni-directional payment channels
*/

const assert = require('assert')
const merge = require('lodash').merge
const { BN } = require('openzeppelin-test-helpers')
const { randomBytes } = require('crypto')
const {
    signMessage,
    verifySignature,
    to16BitsBuffer,
    toBytes32Buffer,
    toBuffer,
    keccak
} = require('./index.js')

const ChannelImplementation = artifacts.require("ChannelImplementation")

// const TestContract = artifacts.require("TestContract")
const OneToken = web3.utils.toWei(new BN(1), 'ether')

const DEFAULT_CHANNEL_STATE = {
    settled: new BN(0),
    balance: new BN(0),
    promised: new BN(0),
    agreements: {
        // 'agreementID': 0
    }
}

async function createConsumer(registry, identity, accountantId) {
    const channelId = await registry.getChannelAddress(identity.address, accountantId)
    const state = { channels: {} }

    return {
        identity,
        state,
        channelId,
        createExchangeMsg: createExchangeMsg.bind(null, state, identity, channelId)
    }
}

function createProvider(identity, accountant) {
    const state = {
        invoices: {
            // "invoiceId": {
            //     agreementID: 1,
            //     agreementTotal: 0,
            //     r: 'abc',
            //     // paid: false,
            //     exchangeMessage: {}
            // }
        },
        agreements: {
            // 'agreementID': 0 // total amount of this agreement
        },
        lastAgreementId: 0,
        promises: []
    }
    return {
        identity,
        state,
        generateInvoice: generateInvoice.bind(null, state),
        validateExchangeMessage: validateExchangeMessage.bind(null, state, identity.address),
        savePromise: promise => state.promises.push(promise),
        settlePromise: settlePromise.bind(null, state, accountant),
        settleAndRebalance: settleAndRebalance.bind(null, state, accountant),
        getBiggestPromise: () => state.promises.reduce((promise, acc) => promise.amount.gt(acc) ? acc : promise, state.promises[0])
    }
}

async function createAccountantService(accountant, operator, token) {
    const state = { channels: {} }
    this.getChannelState = async (channelId, agreementId) => {
        if (!state.channels[channelId]) {
            const channel = await ChannelImplementation.at(channelId)
            state.channels[channelId] = Object.assign({}, await channel.accountant(), {
                balance: await token.balanceOf(channelId),
                promised: new BN(0),
                agreements: { [agreementId]: new BN(0) }
            })
        }

        if (!state.channels[channelId].agreements[agreementId]) {
            state.channels[channelId].agreements[agreementId] = new BN(0)
        }

        return state.channels[channelId]
    }
    this.getOutgoingChannel = async (receiver) => {
        const channelId = await accountant.getChannelId(receiver)
        expect(await accountant.isChannelOpened(channelId)).to.be.true

        if (!state.channels[channelId]) {
            state.channels[channelId] = merge({}, DEFAULT_CHANNEL_STATE, await accountant.channels(channelId))
        }

        return { outgoingChannelId: channelId, outgoingChannelState: state.channels[channelId] }
    }

    return {
        state,
        exchangePromise: exchangePromise.bind(this, state, operator)
    }
}

function generateInvoice(state, amount, agreementId, fee = new BN(0), R = randomBytes(32)) {
    const hashlock = keccak(R)

    // amount have to be bignumber
    if (typeof amount === 'number') amount = new BN(amount)

    // If no agreement id is given, then it's new one
    if (!agreementId) {
        state.lastAgreementId++
        agreementId = state.lastAgreementId
        state.agreements[agreementId] = new BN(0)
    }

    if (!state.agreements[agreementId]) {
        state.agreements[agreementId] = amount
    } else {
        state.agreements[agreementId] = state.agreements[agreementId].add(amount)
    }

    // save invoice
    state.invoices[hashlock] = { R, agreementId, agreementTotal: state.agreements[agreementId], fee }
    return state.invoices[hashlock]
}

function validateInvoice(invoices, hashlock, agreementId, agreementTotal) {
    const invoice = invoices[hashlock]
    expect(agreementId).to.be.equal(invoice.agreementId)
    agreementTotal.should.be.bignumber.equal(invoice.agreementTotal)
}

function createExchangeMsg(state, operator, channelId, invoice, party) {
    const { agreementId, agreementTotal, fee, R } = invoice
    const channelState = state.channels[channelId] || merge({}, DEFAULT_CHANNEL_STATE)

    const diff = agreementTotal.sub(channelState.agreements[agreementId] || new BN(0))
    const amount = channelState.promised.add(diff).add(fee) // we're signing always increasing amount to settle
    const hashlock = keccak(R)
    const promise = createPromise(channelId, amount, fee, hashlock, operator)

    // Create and sign exchange message
    const message = Buffer.concat([
        promise.hash,
        toBytes32Buffer(agreementId),
        toBytes32Buffer(agreementTotal),
        Buffer.from(party.slice(2), 'hex')
    ])
    const signature = signMessage(message, operator.privKey)

    // Write state
    channelState.agreements[agreementId] = agreementTotal
    channelState.promised = amount
    state.channels[channelId] = channelState

    return { promise, agreementId, agreementTotal, party, hash: keccak(message), signature }
}

function validateExchangeMessage(state, receiver, exchangeMsg, payerPubKey) {
    const { promise, agreementId, agreementTotal, party, signature } = exchangeMsg

    // Signature have to be valid
    const message = Buffer.concat([
        promise.hash,
        toBytes32Buffer(agreementId),
        toBytes32Buffer(agreementTotal),
        Buffer.from(party.slice(2), 'hex')
    ])
    expect(verifySignature(message, signature, payerPubKey)).to.be.true
    expect(receiver).to.be.equal(party)

    validatePromise(promise, payerPubKey)
    if (state.invoices) validateInvoice(state.invoices, promise.hashlock, agreementId, agreementTotal)
}

// TODO Can we avoid payerPubKey as he already known from promise... ?
async function exchangePromise(state, operator, exchangeMessage, payerPubKey, receiver) {
    validateExchangeMessage(state, receiver, exchangeMessage, payerPubKey)

    const { promise, agreementId, agreementTotal } = exchangeMessage
    const channelState = await this.getChannelState(promise.channelId, agreementId)

    // amount not covered by previous payment promises should be bigger than balance
    const amount = agreementTotal.sub(channelState.agreements[agreementId])
    channelState.balance.should.be.bignumber.gte(amount)

    // Amount in promise should be set properly
    promise.amount.should.be.bignumber.equal(channelState.promised.add(amount))

    // Save updated channel state
    channelState.balance = channelState.balance.sub(amount)
    channelState.agreements[agreementId] = channelState.agreements[agreementId].add(amount)
    channelState.promised = channelState.promised.add(amount)

    // Update outgoing channel state
    const { outgoingChannelId, outgoingChannelState } = await this.getOutgoingChannel(receiver)
    const promiseAmount = outgoingChannelState.promised.add(amount)
    outgoingChannelState.promised = promiseAmount

    // Issue new payment promise for `amount` value
    return createPromise(outgoingChannelId, promiseAmount, new BN(0), promise.hashlock, operator, receiver)
}

function generatePromise(amountToPay, fee, channelState, operator, receiver) {
    const amount = channelState.settled.add(amountToPay).add(fee) // we're signing always increasing amount to settle
    const R = randomBytes(32)
    const hashlock = keccak(R)
    return Object.assign({},
        createPromise(channelState.channelId, amount, fee, hashlock, operator, receiver),
        { lock: R }
    )
}

function createPromise(channelId, amount, fee, hashlock, operator, receiver) {
    const message = Buffer.concat([
        toBytes32Buffer(channelId, 'address'),  // channelId = channel address
        toBytes32Buffer(amount),   // total promised amount in this channel
        toBytes32Buffer(fee),      // fee to transfer for msg.sender
        hashlock     // hashlock needed for HTLC scheme
    ])

    // sign and verify the signature
    const signature = signMessage(message, operator.privKey)
    expect(verifySignature(message, signature, operator.pubKey)).to.be.true

    return { identity: receiver, channelId, amount, fee, hashlock, hash: keccak(message), signature }
}

function validatePromise(promise, pubKey) {
    const message = Buffer.concat([
        toBytes32Buffer(promise.channelId, 'address'), // channelId = channel address
        toBytes32Buffer(promise.amount),   // total promised amount in this channel
        toBytes32Buffer(promise.fee),      // fee to transfer for msg.sender
        promise.hashlock     // hashlock needed for HTLC scheme
    ])

    expect(verifySignature(message, promise.signature, pubKey)).to.be.true
}

async function settlePromise(state, accountant, promise) {
    // If promise is not given, we're going to use biggest of them
    if (!promise) {
        promise = state.promises.sort((a, b) => b.amount.sub(a.amount).toNumber())[0]
    }

    const invoice = state.invoices[promise.hashlock]
    await accountant.settlePromise(promise.identity, promise.amount, promise.fee, invoice.R, promise.signature)
}

async function settleAndRebalance(state, accountant, promise) {
    if (!promise) {
        promise = state.promises.sort((a, b) => b.amount.sub(a.amount).toNumber())[0]
    }

    const invoice = state.invoices[promise.hashlock]
    await accountant.settleAndRebalance(promise.identity, promise.amount, promise.fee, invoice.R, promise.signature)
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

function signChannelBeneficiaryChange(channelId, newBeneficiary, channelNonce, identity) {
    const message = Buffer.concat([
        Buffer.from(channelId.slice(2), 'hex'),
        Buffer.from(newBeneficiary.slice(2), 'hex'),
        toBytes32Buffer(channelNonce),
    ])

    // sign and verify the signature
    const signature = signMessage(message, identity.privKey)
    expect(verifySignature(message, signature, identity.pubKey)).to.be.true

    return signature
}

function signChannelLoanReturnRequest(channelId, amount, channelNonce, identity) {
    const LOAN_RETURN_PREFIX = "Load return request"
    const message = Buffer.concat([
        Buffer.from(LOAN_RETURN_PREFIX),
        Buffer.from(channelId.slice(2), 'hex'),
        toBytes32Buffer(amount),
        toBytes32Buffer(channelNonce)
    ])

    // sign and verify the signature
    const signature = signMessage(message, identity.privKey)
    expect(verifySignature(message, signature, identity.pubKey)).to.be.true

    return signature
}

function signIdentityRegistration(registryAddress, accountantId, loan, fee, beneficiary, identity) {
    const message = Buffer.concat([
        Buffer.from(registryAddress.slice(2), 'hex'),
        Buffer.from(accountantId.slice(2), 'hex'),
        toBytes32Buffer(loan),
        toBytes32Buffer(fee),
        Buffer.from(beneficiary.slice(2), 'hex')
    ])

    // sign and verify the signature
    const signature = signMessage(message, identity.privKey)
    expect(verifySignature(message, signature, identity.pubKey)).to.be.true

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
    createAccountantService,
    createConsumer,
    createProvider,
    createPromise,
    generatePromise,
    signChannelBeneficiaryChange,
    signChannelLoanReturnRequest,
    signExitRequest,
    signIdentityRegistration,
    validatePromise
}
