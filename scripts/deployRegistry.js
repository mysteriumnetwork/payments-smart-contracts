const ethTx = require('@ethereumjs/tx').Transaction
const ethUtils = require('ethereumjs-util')
const BN = require('bn.js')

const registryBytecode = require('../build/contracts/Registry.json').bytecode
const hermesBytecode = require('../build/contracts/HermesImplementation.json').bytecode


function getRawTrasaction(byteCode, gasLimit, nonce = 0) {
    return {
        nonce: nonce,
        gasPrice: 100000000000,        // 100 Gwei
        gasLimit: gasLimit,
        value: 0,
        data: byteCode,
        v: 27,
        r: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d', // Buffer.from('Mysterium Network payment system').toString('hex')
        s: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d'
    }
}

function generateDeployTx(byteCode, gasLimit = 3000000) {
    // const tx = new ethTx(rawTransaction)

    const rawTransaction = getRawTrasaction(byteCode, gasLimit)
    const tx = ethTx.fromTxData(rawTransaction)
    const res = {
        sender: ethUtils.toChecksumAddress(
            tx.getSenderAddress().toString('hex')
        ),
        rawTx: '0x' + tx.serialize().toString('hex'),
        contractAddress: ethUtils.toChecksumAddress(
            '0x' + ethUtils.generateAddress(tx.getSenderAddress().toBuffer(), ethUtils.toBuffer(0)).toString('hex')
        )
    }
    return res
}

module.exports = async (web3, account = undefined) => {
    if (!account) {
        account = (await web3.eth.getAccounts())[0]
    }

    // Deploy Registry into deterministic address
    const registryTxMetadata = generateDeployTx(registryBytecode, 3121666)
    const deployedCode = await web3.eth.getCode(registryTxMetadata.contractAddress)
    if (deployedCode.length <= 3) {
        await web3.eth.sendTransaction({
            from: account, to: registryTxMetadata.sender, value: '3121666000000000000'
        })
        await web3.eth.sendSignedTransaction(registryTxMetadata.rawTx)
    }

    // Deploy HermesImplementation into deterministic address
    const hermesTxMetadata = generateDeployTx(hermesBytecode, 3465861)
    const deployedHermesCode = await web3.eth.getCode(hermesTxMetadata.contractAddress)
    if (deployedHermesCode.length <= 3) {
        await web3.eth.sendTransaction({
            from: account, to: hermesTxMetadata.sender, value: '3465861000000000000'
        })
        await web3.eth.sendSignedTransaction(hermesTxMetadata.rawTx)
    }

    return [
        registryTxMetadata.contractAddress,
        hermesTxMetadata.contractAddress
    ]
}
