const ethTx = require('ethereumjs-tx').Transaction
const ethUtils = require('ethereumjs-util')
const BN = require('bn.js')

const registryBytecode = require('../build/contracts/Registry.json').bytecode

const rawTransaction = {
    nonce: 0,
    gasPrice: 10000000000,        // 100 Gwei
    gasLimit: 3000000,
    value: 0,
    data: registryBytecode,
    v: 27,
    r: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d', // Buffer.from('Mysterium Network payment system').toString('hex')
    s: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d'
}

function generateDeployTx(calldata) {
    const tx = new ethTx(rawTransaction)
    const res = {
        sender: ethUtils.toChecksumAddress(
            '0x' + tx.getSenderAddress().toString('hex')
        ),
        rawTx: '0x' + tx.serialize().toString('hex'),
        contractAddress: ethUtils.toChecksumAddress(
            '0x' + ethUtils.generateAddress(tx.getSenderAddress(), ethUtils.toBuffer(0)).toString('hex')
        )
    }
    return res
}

module.exports = async (web3, account = undefined) => {
    const res = generateDeployTx()

    if (!account) {
        account = (await web3.eth.getAccounts())[0]
    }

    const deployedCode = await web3.eth.getCode(res.contractAddress)
    if (deployedCode.length <= 3) {
        await web3.eth.sendTransaction({
            from: account, to: res.sender, value: '1000000000000000000'
        })
        await web3.eth.sendSignedTransaction(res.rawTx)
    }

    return res.contractAddress
}
