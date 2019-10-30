const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

module.exports = async function(deployer, network, accounts) {
    // We do have MYSTT deployed on kovan already
    if (network  === 'kovan') {
        const tokenAddress = '0xE67e41367c1e17ede951A528b2A8BE35c288c787'
        deployer.deploy(DEXImplementation)
        .then(_ => deployer.deploy(DEXProxy, DEXImplementation.address, accounts[0]))
        .then(_ => deployer.deploy(ChannelImplementation))
        .then(_ => deployer.deploy(AccountantImplementation))
        .then(_ => deployer.deploy(Registry, tokenAddress, DEXProxy.address, ChannelImplementation.address, AccountantImplementation.address, 0, 0))
    } else {
        deployer.deploy(SafeMathLib)
        deployer.link(SafeMathLib, [MystToken])

        deployer.deploy(MystToken)
        .then(_ => deployer.deploy(DEXImplementation))
        .then(_ => deployer.deploy(ChannelImplementation))
        .then(_ => deployer.deploy(AccountantImplementation))
        .then(_ => deployer.deploy(Registry, MystToken.address, DEXImplementation.address, ChannelImplementation.address, AccountantImplementation.address, 0, 0))
    }
};
