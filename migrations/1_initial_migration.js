const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")

const uniswap = require("../scripts/deployUniswap")
const WETH = require("../scripts/deployWETH")
const uniswapRouter = require('../scripts/UniswapV2Router02.json')

const deployRegistry = require("../scripts/deployRegistry")

module.exports = async function (deployer, network, accounts) {
  if (network === 'mumbai') return

  if (network === 'goerli') {
    // We do have MYSTTv2 deployed on Görli already
    // const tokenAddress = '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5'
    const tokenAddress = '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8'
    // const parentRegistry = '0x15B1281F4e58215b2c3243d864BdF8b9ddDc0DA2'
    const parentRegistry = '0x0000000000000000000000000000000000000000'
    const quickSwapRouterAddress = '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff'

    await deployer.deploy(ChannelImplementation)
    await deployer.deploy(HermesImplementation)
    // const channelImplementationAddress = '0x4eef018a9c56c4b5ee57ec107c152f1d3e3b8931'
    // const hermesImplementationAddress = '0x553abe2e4374cddeff1b092f342efddaf082582a'
    console.log('\n Deploying `Registry`')
    console.log('--------------------------------')
    const registryAddress = await deployRegistry(web3, accounts[0])
    const registry = await Registry.at(registryAddress)
    await registry.initialize(tokenAddress, quickSwapRouterAddress, 0, ChannelImplementation.address, HermesImplementation.address, parentRegistry)
    console.log('   > contract address: ', registryAddress, ' \n')
  } else {
    // Deploy WETH token
    await WETH.deploy(web3, accounts[0])

    // Deploy Uniswap smart contracts: Factory, Router, Migrator
    await uniswap.deploy(web3, accounts[0])

    // Deploy Registry
    const registryAddress = await deployRegistry(web3, accounts[0])
    console.log('   > contract address: ', registryAddress, ' \n')
  }
}
