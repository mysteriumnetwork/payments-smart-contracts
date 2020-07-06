const { BN } = require('@openzeppelin/test-helpers')
const erc1820 = require("../scripts/erc1820Deploy")

const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const DEXImplementation = artifacts.require("MystDEX")
const MystToken = artifacts.require("MystToken")
const OldMystToken = artifacts.require("OldMystToken")
const SafeMathLib = artifacts.require("SafeMathLib")

const zeroAddress = '0x0000000000000000000000000000000000000000'

module.exports = async function (deployer, network, accounts) {
    // Deploy ERC1820 Pseudo-introspection Registry Contract
    await erc1820.deploy(web3, accounts[0])

    let originalToken, originalSupply

    // We do have MYSTTv1 deployed on Görli already
    if (network === 'goerli') {
        originalToken = '0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb'
        originalSupply = new BN('200000000000000000')
    } else {
        await deployer.deploy(SafeMathLib)
        await deployer.link(SafeMathLib, [OldMystToken])
        // const token = await deployer.deploy(OldMystToken)
        // originalToken = OldMystToken.address
        // originalSupply = new BN('100000000000') // 1000 MYSTT
        // await token.mint(accounts[0], originalSupply)
    }

    // await deployer.deploy(MystToken, originalToken, originalSupply, [])
    // await deployer.deploy(DEXImplementation)
    // await deployer.deploy(ChannelImplementation)
    // await deployer.deploy(HermesImplementation)
    // await deployer.deploy(Registry, MystToken.address, DEXImplementation.address, 0, 0, ChannelImplementation.address, HermesImplementation.address, zeroAddress)
};
