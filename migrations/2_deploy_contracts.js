const IdentityRegistry = artifacts.require("IdentityRegistry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const MystToken = artifacts.require("MystToken")

module.exports = async function(deployer, network, accounts) {
    deployer.deploy(MystToken)
    .then(_ => deployer.deploy(DEXImplementation))
    .then(_ => deployer.deploy(ChannelImplementation, MystToken.address, DEXImplementation.address, accounts[0], 1))
    .then(_ => deployer.deploy(IdentityRegistry, MystToken.address, DEXImplementation.address, 0, ChannelImplementation.address))
};
