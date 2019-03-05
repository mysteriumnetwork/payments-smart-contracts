const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const MystToken = artifacts.require("MystToken")

module.exports = async function(deployer, network, accounts) {
    deployer.deploy(MystToken)
    .then(_ => deployer.deploy(DEXImplementation))
    .then(_ => deployer.deploy(IdentityImplementation, MystToken.address, DEXImplementation.address, accounts[0], 1))
    .then(_ => deployer.deploy(IdentityRegistry, MystToken.address, 0, IdentityImplementation.address))
};
