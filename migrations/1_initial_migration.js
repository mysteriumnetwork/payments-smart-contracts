const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")

const uniswap = require("../scripts/deployUniswap")
const WETH = require("../scripts/deployWETH")

const deployRegistry = require("../scripts/deployRegistry")

const tokenAddr = {
    mumbai: '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8',
    goerli: '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5',
    polygon: '0x1379e8886a944d2d9d440b3d88df536aea08d9f3',
    ethereum: '0x4cf89ca06ad997bc732dc876ed2a7f26a9e7f361'
}
const supportedBlockchains = Object.keys(tokenAddr)

module.exports = async function (deployer, network, accounts) {
    if (supportedBlockchains.includes(network)) {
        const parentRegistry = '0x0000000000000000000000000000000000000000'
        const tokenAddress = tokenAddr[network]
        const swapRouterAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'  // uniswap v2 || quickswap router address

        // Deploy Channel implementation into blockchain
        await deployer.deploy(ChannelImplementation)

        // Deploy Registry and Hermes implementation into deterministic address, same on any chain
        const minimalHermesStake = web3.utils.toWei(new BN('100'), 'ether') // 100 MYST
        const [registryAddress, hermesImplementationAddress] = await deployRegistry(web3, accounts[0])
        const registry = await Registry.at(registryAddress)
        await registry.initialize(tokenAddress, swapRouterAddress, minimalHermesStake, ChannelImplementation.address, hermesImplementationAddress, parentRegistry)

        console.log('   > registry contract address: ', registryAddress)
        console.log('   > hermes implementation address: ', hermesImplementationAddress, '\n')
    }
    else {
        // Deploy WETH token
        await WETH.deploy(web3, accounts[0])

        // Deploy Uniswap smart contracts: Factory, Router, Migrator
        await uniswap.deploy(web3, accounts[0])

        // Deploy Registry and Hermes implementation
        const [registryAddress, hermesImplementationAddress] = await deployRegistry(web3, accounts[0])

        console.log('   > registry contract address: ', registryAddress)
        console.log('   > hermes implementation address: ', hermesImplementationAddress, '\n')
    }
}
