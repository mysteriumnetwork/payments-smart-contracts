/*
    This is deployment script which can be used together with Hardhat instead of Truffle.
*/

const hre = require("hardhat");

const ethTx = require('@ethereumjs/tx').Transaction
const ethUtils = require('ethereumjs-util')

const registryBytecode = require('./registryBytecode.json').bytecode
const hermesBytecode = require('./hermesBytecode.json').bytecode


async function main() {
    const Token = await hre.ethers.getContractFactory("MystToken")
    const Registry = await hre.ethers.getContractFactory("Registry")

    const parentRegistry = '0x0000000000000000000000000000000000000000'
    const tokenAddress = '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8'
    const swapRouterAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'
    const hermesOperator = "0xbFD2D96259De92B5817c83b7E1b756Ba8df1D59D"

    console.log('\n Deploying `ChannelImplementation`')
    console.log('--------------------------------')
    const ChannelImplementation = await hre.ethers.getContractFactory("ChannelImplementation")
    const channelImplementation = await ChannelImplementation.deploy()
    await channelImplementation.deployed()
    console.log("Channel implementation deployed to:", channelImplementation.address)

    console.log('\n Deploying `Registry`')
    console.log('--------------------------------')

    const [registryAddress, hermesImplementationAddress] = await deployRegistry()
    console.log('Registry  deployed to:', registryAddress)
    console.log('Hermes implementation deployed to:', hermesImplementationAddress)

    // Initialize registry
    const registry = await Registry.attach(registryAddress)
    await registry.initialize(tokenAddress, swapRouterAddress, 0, channelImplementation.address, hermesImplementationAddress, parentRegistry)

    // Register hermes with 5000 tokens stake, 20% tx fee and 100 max channel balance
    const hermesStake = hre.ethers.BigNumber.from('5000000000000000000000')    // 5000 tokens
    const hermesFee = 2000 // 20.00%
    const minChannelStake = hre.ethers.BigNumber.from('1000000000000000000')   // 1 token
    const maxChannelStake = hre.ethers.BigNumber.from('100000000000000000000') // 100 tokens
    const url = Buffer.from('68747470733a2f2f746573746e6574332d6865726d65732e6d797374657269756d2e6e6574776f726b2f', 'hex') // https://testnet3-hermes.mysterium.network/

    // Approve enough tokens to registry so hermes operator could add stake
    const token = await Token.attach(tokenAddress)
    await token.approve(registryAddress, hermesStake)

    await registry.registerHermes(hermesOperator, hermesStake, hermesFee, minChannelStake, maxChannelStake, url, { gasLimit: 3000000 })
    console.log('HermesID: ', await registry.getHermes('0xc198d5539B335c48A0eAF49136dF2f5cED3B160d'))
}

function getRawTrasaction(byteCode, gasLimit, nonce = 0) {
    return {
        nonce,
        gasPrice: 1000000000000,        // 1000 Gwei
        gasLimit: gasLimit,
        value: 0,
        data: byteCode,
        v: 27,
        r: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d', // Buffer.from('Mysterium Network payment system').toString('hex')
        s: '0x4d797374657269756d204e6574776f726b207061796d656e742073797374656d'
    }
}

function generateDeployTx(byteCode, gasLimit = 3500000) {
    const rawTx = getRawTrasaction(byteCode, gasLimit)
    const tx = ethTx.fromTxData(rawTx)
    return {
        sender: ethUtils.toChecksumAddress(
            tx.getSenderAddress().toString('hex')
        ),
        rawTx: '0x' + tx.serialize().toString('hex'),
        contractAddress: ethUtils.toChecksumAddress(
            '0x' + ethUtils.generateAddress(tx.getSenderAddress().toBuffer(), ethUtils.toBuffer(0)).toString('hex')
        )
    }
}

async function deployRegistry() {
    const account = (await ethers.getSigners())[0]

    // Deploy Registry into deterministic address
    const registryTxMetadata = generateDeployTx(registryBytecode, 2989157)
    const deployedCode = await hre.ethers.provider.getCode(registryTxMetadata.contractAddress)
    if (deployedCode.length <= 3) {
        const amount = hre.ethers.BigNumber.from('2989157000000000000')
        await (await account.sendTransaction({
            from: await account.getAddress(), to: registryTxMetadata.sender, value: amount, gasPrice: hre.ethers.BigNumber.from('50000000000')
        })).wait()

        await hre.ethers.provider.sendTransaction(registryTxMetadata.rawTx)
    }


    // Deploy HermesImplementation into deterministic address
    const hermesTxMetadata = generateDeployTx(hermesBytecode, 3327541)
    const deployedHermesCode = await hre.ethers.provider.getCode(hermesTxMetadata.contractAddress)
    if (deployedHermesCode.length <= 3) {
        const amount = hre.ethers.BigNumber.from('3327541000000000000')
        await (await account.sendTransaction({
            from: await account.getAddress(), to: hermesTxMetadata.sender, value: amount, gasPrice: hre.ethers.BigNumber.from('50000000000')
        })).wait()

        await hre.ethers.provider.sendTransaction(hermesTxMetadata.rawTx)
    }

    return [
        registryTxMetadata.contractAddress,
        hermesTxMetadata.contractAddress
    ]
}


// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });
