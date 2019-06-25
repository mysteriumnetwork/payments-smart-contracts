const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const DEXProxy = artifacts.require("DEXProxy")
const MystToken = artifacts.require("MystToken")

module.exports = async function(deployer, network, accounts) {
    // We do have MYST deployed on ropsten already
    if (network  === 'ropsten') {
        const tokenAddress = '0x453c11c058F13B36a35e1AEe504b20c1A09667De'
        deployer.deploy(DEXImplementation)
        .then(_ => deployer.deploy(DEXProxy, DEXImplementation.address, accounts[0]))
        .then(_ => deployer.deploy(ChannelImplementation))
        .then(_ => deployer.deploy(AccountantImplementation))
        .then(_ => deployer.deploy(Registry, tokenAddress, DEXProxy.address, ChannelImplementation.address, AccountantImplementation.address, 0, 0))
    } else {
        deployer.deploy(MystToken)
        .then(_ => deployer.deploy(DEXImplementation))
        .then(_ => deployer.deploy(ChannelImplementation))
        .then(_ => deployer.deploy(AccountantImplementation))
        .then(_ => deployer.deploy(Registry, MystToken.address, DEXImplementation.address, ChannelImplementation.address, AccountantImplementation.address, 0, 0))
    }
};
