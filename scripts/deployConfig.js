const EthereumTx = require('ethereumjs-tx').Transaction
const EthereumUtils = require('ethereumjs-util')

const artifacts = require('../build/contracts/Config.json')
const bytecode = artifacts.bytecode
const abi = artifacts.abi


// It creates raw transaction signed by address which private key we don't know.
// This hack allows to always deploy given smartcontract's bytecode into same address in any network.
// If smart-contract's code will change for at least one bit address will change into absolytely different one.
const generateTx = () => {
    const rawTx = {
        nonce: 0,
        gasPrice: 100000000000,
        gasLimit: 200000,
        value: 0,
        data: bytecode,
        v: 27,
        r: '0xffb2d0383ab970139a7e0fa9263c446199464b5778b92bf9e7936b5a383a8fd0',
        s: '0x0abababababababababababababababababababababababababababababababa'
    }
    const tx = new EthereumTx(rawTx)
    const res = {
        sender: EthereumUtils.toChecksumAddress('0x' + tx.getSenderAddress().toString('hex')),
        rawTx: '0x' + tx.serialize().toString('hex'),
        contractAddr: EthereumUtils.toChecksumAddress(
            '0x' + EthereumUtils.generateAddress('0x' + tx.getSenderAddress().toString('hex'), 0).toString('hex')),
    }
    return res
}

const deployConfig = async (web3, account, owner) => {
    const res = generateTx()
    const deployedCode = await web3.eth.getCode(res.contractAddr)

    // Do this only if such smart contract was not deployed yet.
    if (deployedCode.length <= 3) {
        // Topup sender with ethers so it could sucessfully deploy
        await web3.eth.sendTransaction({
            from: account, to: res.sender, value: '20000000000000000'
        })

        // Send signed transaction into network
        await web3.eth.sendSignedTransaction(res.rawTx)

        // Set owner if it was provided
        if (owner) {
            const config = new web3.eth.Contract(abi, res.contractAddr)
            await config.methods.setOwner(owner).send({ from: owner, value: '0' })
        }
    }
    return res.contractAddr
}

module.exports.deploy = deployConfig
