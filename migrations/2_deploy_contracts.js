const deployConfig = require('../scripts/deployConfig').deploy

const Config = artifacts.require("Config")
const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

module.exports = async function (deployer, network, accounts) {
    // We do have MYSTT and Config deployed on Görli already
    if (network === 'goerli') {
        const tokenAddress = '0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb'
        const configAddress = '0xF8B0E425AB9BE026B67a6429F0C8E3394983EdA8'
        const dexImplAddress = '0xBB617cdCd308a7b5304F2f6261458821412a6E41'
        const dexProxyAddress = '0xE3AeE81C87C87D219F1F94DBFD78BBC6bE79e5Fb'
        const channelImplementationAddress = '0x0518D49B9c0619c7F7bD0745ac773C0f0B5Ac15F'
        const accountantImplementationAddress = '0x33eC8FEB494a25A965D8FB77bE48a9c1F35CA895'

        await setupConfig(configAddress, accounts[0], channelImplementationAddress, accountantImplementationAddress)
        await deployer.deploy(Registry, tokenAddress, dexProxyAddress, configAddress, 0, 0)
    } else {
        // Deploy config
        await deployer.deploy(SafeMathLib)
        await deployer.link(SafeMathLib, [MystToken])
        await deployer.deploy(MystToken)
        await deployer.deploy(DEXImplementation)
        await deployer.deploy(ChannelImplementation)
        await deployer.deploy(AccountantImplementation)
        await deployer.deploy(Registry, MystToken.address, DEXImplementation.address, 0, 0, ChannelImplementation.address, AccountantImplementation.address)
    }
};

async function setupConfig(configAddress, owner, channelImplementation, accountantImplementation) {
    const config = await Config.at(configAddress)
    await config.setOwner(owner)

    const channelSlot = '0x48df65c92c1c0e8e19a219c69bfeb4cf7c1c123e0c266d555abb508d37c6d96e' // keccak256('channel implementation')
    const channelImplAddressBytes = '0x' + channelImplementation.slice(2).toString(16).padStart(64, 0)
    await config.addConfig(channelSlot, channelImplAddressBytes)

    const accountantSlot = '0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0' // keccak256('accountant implementation')
    const AccImplAddressBytes = '0x' + accountantImplementation.slice(2).toString(16).padStart(64, 0)
    await config.addConfig(accountantSlot, AccImplAddressBytes)

    return config
}
