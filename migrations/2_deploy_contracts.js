const IdentityRegistry = artifacts.require("IdentityRegistry")
const IdentityImplementation = artifacts.require("IdentityImplementation")
const MystToken = artifacts.require("MystToken")

module.exports = async function(deployer, network, accounts) {
    deployer.deploy(MystToken)
    .then(_ => deployer.deploy(IdentityImplementation))
    .then(_ => deployer.deploy(IdentityRegistry, MystToken.address, 0, IdentityImplementation.address))
};
