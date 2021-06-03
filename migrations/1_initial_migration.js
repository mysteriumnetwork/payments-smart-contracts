const ChannelImplementation = artifacts.require("ChannelImplementation")

const uniswap = require("../scripts/deployUniswap")
const WETH = require("../scripts/deployWETH")

const deployRegistry = require("../scripts/deployRegistry")

module.exports = async function (deployer, network, accounts) {

  if (network === 'mumbai' || network === 'goerli') {
    const parentRegistry = (network === 'mumbai') ? '0x0000000000000000000000000000000000000000' : '0x15B1281F4e58215b2c3243d864BdF8b9ddDc0DA2'
    const tokenAddress = (network === 'mumbai') ? '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8' : '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5'
    const swapRouterAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

    await deployer.deploy(ChannelImplementation)

    console.log('\n Deploying `Registry`')
    console.log('--------------------------------')

    const [registryAddress, hermesImplementationAddress] = await deployRegistry(web3, accounts[0])
    await registry.initialize(tokenAddress, swapRouterAddress, 0, ChannelImplementation.address, hermesImplementationAddress, parentRegistry)

    console.log('   > registry contract address: ', registryAddress, ' \n')
    console.log('   > hermes implementation address: ', hermesImplementationAddress, ' \n')
  }
  else {
    // Deploy WETH token
    await WETH.deploy(web3, accounts[0])

    // Deploy Uniswap smart contracts: Factory, Router, Migrator
    await uniswap.deploy(web3, accounts[0])

    // Deploy Registry and Hermes implementation
    const [registryAddress, hermesImplementationAddress] = await deployRegistry(web3, accounts[0])

    console.log('   > registry contract address: ', registryAddress, ' \n')
    console.log('   > hermes implementation address: ', hermesImplementationAddress, ' \n')
  }
}
