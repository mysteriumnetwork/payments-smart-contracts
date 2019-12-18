const leftPad = require('left-pad')

const Config = artifacts.require("Config")
const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

module.exports = async function (deployer, network, accounts) {
    // We do have MYSTT deployed on kovan already
    if (network === 'kovan') {
        const tokenAddress = '0xE67e41367c1e17ede951A528b2A8BE35c288c787'
        deployer.deploy(DEXImplementation)
            .then(_ => deployer.deploy(DEXProxy, DEXImplementation.address, accounts[0]))
            .then(_ => deployer.deploy(ChannelImplementation))
            .then(_ => deployer.deploy(AccountantImplementation))
            .then(_ => deployer.deploy(Config))
            .then(_ => deployer.deploy(Registry, tokenAddress, DEXProxy.address, Config.address, 0, 0))
    } else {
        deployer.deploy(SafeMathLib)
        deployer.link(SafeMathLib, [MystToken])

        deployer.deploy(MystToken)
            .then(_ => deployer.deploy(DEXImplementation))
            .then(_ => deployer.deploy(ChannelImplementation))
            .then(_ => deployer.deploy(AccountantImplementation))
            .then(_ => deployer.deploy(Config))
            .then(config => setupConfig(config, accounts[0], ChannelImplementation.address, AccountantImplementation.address))
            .then(_ => deployer.deploy(Registry, MystToken.address, DEXImplementation.address, Config.address, 0, 0))
    }
};

async function setupConfig(config, owner, channelImplementation, accountantImplementation) {
    await config.setOwner(owner)

    const channelSlot = '0x48df65c92c1c0e8e19a219c69bfeb4cf7c1c123e0c266d555abb508d37c6d96e'    // keccak256('channel implementation')
    const channelImplAddressBytes = '0x' + leftPad((channelImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(channelSlot, channelImplAddressBytes)

    const accountantSlot = '0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0' // keccak256('accountant implementation')
    const AccImplAddressBytes = '0x' + leftPad((accountantImplementation.slice(2)).toString(16), 64, 0)
    await config.addConfig(accountantSlot, AccImplAddressBytes)
}
