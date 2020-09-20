const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const MystToken = artifacts.require("MystToken")
const OldMystToken = artifacts.require("OldMystToken")

const SafeMathLib = artifacts.require("SafeMathLib")

const uniswap = require("../scripts/deployUniswap")
const WETH = require("../scripts/deployWETH")

const zeroAddress = '0x0000000000000000000000000000000000000000'

const multicallBytecode = require('../scripts/installation_data.json').bytecode.multicall

module.exports = async function (deployer, network, accounts) {
    // We do have MYSTTv1 deployed on Görli already
    if (network === 'goerli') {
        const originalToken = '0x8EA3F639e98da04708520C63b34AfBAa1594bC82'
        await deployer.deploy(MystToken, originalToken)
        await deployer.deploy(DEXImplementation)
        await deployer.deploy(ChannelImplementation)
        await deployer.deploy(HermesImplementation)
        await deployer.deploy(Registry, MystToken.address, DEXImplementation.address, 0, ChannelImplementation.address, HermesImplementation.address, zeroAddress)
    } else {
        await deployer.deploy(SafeMathLib)
        await deployer.link(SafeMathLib, [OldMystToken])

        // Deploy WETH token
        await WETH.deploy(web3, accounts[0])

        // Deploy Uniswap smart contracts: Factory, Router, Migrator
        await uniswap.deploy(web3, accounts[0])

        // Deploy Uniswap V2 Multicall contract
        await web3.eth.sendTransaction({
            from: accounts[0],
            data: multicallBytecode,
            gas: 5700000
        })
    }
}
