const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const MystToken = artifacts.require("MystToken")

const uniswap = require("../scripts/deployUniswap")
const WETH = require("../scripts/deployWETH")
const deployRouter02 = require('../scripts/UniswapV2Router02.json')

const zeroAddress = '0x0000000000000000000000000000000000000000'

module.exports = async function (deployer, network, accounts) {
    // We do have MYSTTv1 deployed on Görli already
    if (network === 'goerli') {
        const originalToken = '0x8EA3F639e98da04708520C63b34AfBAa1594bC82'
        await deployer.deploy(MystToken, originalToken)
        await deployer.deploy(ChannelImplementation)
        await deployer.deploy(HermesImplementation)
        await deployer.deploy(Registry, MystToken.address, deployRouter02.contractAddr, 0, ChannelImplementation.address, HermesImplementation.address, zeroAddress)
    } else {
        // Deploy WETH token
        await WETH.deploy(web3, accounts[0])

        // Deploy Uniswap smart contracts: Factory, Router, Migrator
        await uniswap.deploy(web3, accounts[0])
    }
}
