const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

const zeroAddress = '0x0000000000000000000000000000000000000000'

module.exports = async function (deployer, network, accounts) {
    // We do have MYSTT and Config deployed on Görli already
    if (network === 'goerli') {
        const tokenAddress = '0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb'
        const dexImplAddress = '0xBB617cdCd308a7b5304F2f6261458821412a6E41'
        const dexProxyAddress = '0xE3AeE81C87C87D219F1F94DBFD78BBC6bE79e5Fb'
        const channelImplementationAddress = '0x0518D49B9c0619c7F7bD0745ac773C0f0B5Ac15F'
        const hermesImplementationAddress = '0x33eC8FEB494a25A965D8FB77bE48a9c1F35CA895'

        await deployer.deploy(Registry, tokenAddress, dexProxyAddress, 0, 0, channelImplementationAddress, hermesImplementationAddress)
    } else {
        // Deploy config
        await deployer.deploy(SafeMathLib)
        await deployer.link(SafeMathLib, [MystToken])
        await deployer.deploy(MystToken)
        await deployer.deploy(DEXImplementation)
        await deployer.deploy(ChannelImplementation)
        await deployer.deploy(HermesImplementation)
        await deployer.deploy(Registry, MystToken.address, DEXImplementation.address, 0, 0, ChannelImplementation.address, HermesImplementation.address, zeroAddress)
    }
};
