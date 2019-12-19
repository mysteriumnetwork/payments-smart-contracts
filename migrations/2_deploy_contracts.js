const leftPad = require('left-pad')
const deployConfig = require('../scripts/deployConfig').deploy

const Config = artifacts.require("Config")
const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const ChannelImplementationProxy = artifacts.require("ChannelImplementationProxy")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

module.exports = async function (deployer, network, accounts) {
    // Deploy config
    const configAddress = await deployConfig(web3, accounts[0])
    console.log('    Config address: ', configAddress)

    // We do have MYSTT deployed on görli already
    if (network === 'goerli') {
        const tokenAddress = '0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb'
        deployer.deploy(DEXImplementation)
            .then(_ => deployer.deploy(DEXProxy, DEXImplementation.address, accounts[0]))
            .then(_ => deployer.deploy(ChannelImplementation))
            .then(_ => deployer.deploy(AccountantImplementation))
            .then(_ => deployer.deploy(ChannelImplementationProxy, configAddress))
            .then(_ => setupConfig(configAddress, accounts[0], ChannelImplementation.address, AccountantImplementation.address, ChannelImplementationProxy.address))
            .then(_ => deployer.deploy(Registry, tokenAddress, DEXProxy.address, configAddress, 0, 0))
    } else {
        await deployer.deploy(SafeMathLib)
        await deployer.link(SafeMathLib, [MystToken])
        await deployer.deploy(MystToken)
        await deployer.deploy(DEXImplementation)
        await deployer.deploy(ChannelImplementation)
        await deployer.deploy(AccountantImplementation)
        await deployer.deploy(ChannelImplementationProxy, configAddress)
        await setupConfig(configAddress, accounts[0], ChannelImplementation.address, AccountantImplementation.address, ChannelImplementationProxy.address)
        await deployer.deploy(Registry, MystToken.address, DEXImplementation.address, configAddress, 0, 0)
    }
};

async function setupConfig(configAddress, owner, channelImplementation, accountantImplementation, proxyAddress) {
    const config = await Config.at(configAddress)
    await config.setOwner(owner)

    const channelSlot = '0x48df65c92c1c0e8e19a219c69bfeb4cf7c1c123e0c266d555abb508d37c6d96e' // keccak256('channel implementation')
    const channelImplAddressBytes = '0x' + leftPad((channelImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(channelSlot, channelImplAddressBytes)

    const proxySlot = '0x2ef7e7c50e1b6a574193d0d32b7c0456cf12390a0872cf00be4797e71c3756f7' // keccak256('channel implementation proxy')
    const proxyAddressBytes = '0x' + leftPad((proxyAddress.slice(2)).toString(16), 64, 0)
    await config.addConfig(proxySlot, proxyAddressBytes)

    const accountantSlot = '0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0' // keccak256('accountant implementation')
    const AccImplAddressBytes = '0x' + leftPad((accountantImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(accountantSlot, AccImplAddressBytes)

    return config
}
