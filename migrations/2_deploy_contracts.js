const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const AccountantImplementation = artifacts.require("AccountantImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const MystToken = artifacts.require("MystToken")

module.exports = async function(deployer, network, accounts) {
    deployer.deploy(MystToken)
    .then(_ => deployer.deploy(DEXImplementation))
    .then(_ => deployer.deploy(ChannelImplementation))
    .then(_ => deployer.deploy(AccountantImplementation))
    .then(_ => deployer.deploy(Registry, MystToken.address, DEXImplementation.address, ChannelImplementation.address, AccountantImplementation.address, 0, 0))
};
