const EthereumTx = require('ethereumjs-tx')
const { BN } = require('openzeppelin-test-helpers')
const { 
    generatePrivateKey,
    privateToPublic,
    toAddress
} = require('./index.js')

const state = {
    nonce: 0
}

function generateAccount() {
    const privKey = generatePrivateKey()
    const pubKey = privateToPublic(privKey)
    const address = toAddress(pubKey)
    return { privKey, pubKey, address }
}

async function sendTx(destination, payload, account) {
    const txParams = {
        nonce: '0x' + (new BN(state.nonce)).toBuffer().toString('hex'),
        gasPrice: '0x09184e72',
        gasLimit: '0x271000',
        to: destination,
        value: '0x00',
        data: payload,
        chainId: 5777 // EIP 155 chainId - mainnet: 1, ropsten: 3, localchain: 1337
    }
    const tx = new EthereumTx(txParams)
    tx.sign(account.privKey)
    const serializedTx = tx.serialize()
    await web3.eth.sendSignedTransaction('0x' + serializedTx.toString('hex'))

    // nonce have to be increased after each transation
    state.nonce += 1 
}


module.exports = {
    generateAccount,
    sendTx
}
