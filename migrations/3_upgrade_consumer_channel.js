const { BN } = require('web3-utils')

const MystToken = artifacts.require("MystToken")
const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")
const deployRegistry = require("../scripts/deployRegistry")

const tokenAddr = {
    mumbai: '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8',
    goerli: '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5',
    polygon: '0x1379e8886a944d2d9d440b3d88df536aea08d9f3',
    ethereum: '0x4cf89ca06ad997bc732dc876ed2a7f26a9e7f361'
}

// Hermes operator is signing hermes payment promises. Change it before actual deployment.
const HERMES_OPERATOR = '0xbb322f4a93f4001d3f2dd07aa957c3e8361e8976'
const MEGA_OWNER = '0xd1beE7b6C062b01815e7F8934Ce264C1c1cd250d'

const deployNewImplementation = true
module.exports = async function (deployer, network, accounts) {
    const account = accounts[0]

    if (deployNewImplementation) {
        // Deploy Channel and Hermes implementations into blockchain
        await deployer.deploy(ChannelImplementation, { from: account })
        console.log('  :> ChannelImplementation:', ChannelImplementation.address)
        
        await deployer.deploy(HermesImplementation, { from: account })
        console.log('  :> HermesImplementation:', HermesImplementation.address)

        const tokenAddress = tokenAddr[network]
        const [registryAddress, _] = await deployRegistry(web3, account)
        const channelImplementationAddress = ChannelImplementation.address
        const hermesImplementationAddress = HermesImplementation.address

        const hermesOperator = HERMES_OPERATOR
        const token = await MystToken.at(tokenAddress)
        const registry = await Registry.at(registryAddress)

        // Set new channel implementation
        await registry.setImplementations(ChannelImplementation.address, hermesImplementationAddress)

        // Register new hermes
        const hermesStake = web3.utils.toWei(new BN('500'), 'ether') //  500 tokens
        const hermesFee = 2000 // 20.00%
        const minChannelStake = web3.utils.toWei(new BN('0'), 'ether') // 0 token
        const maxChannelStake = web3.utils.toWei(new BN('100'), 'ether') // 100 tokens
        const url = Buffer.from('68747470733a2f2f6865726d6573332e6d797374657269756d2e6e6574776f726b2f', 'hex') // https://hermes3.mysterium.network/

        await token.approve(registryAddress, hermesStake, { from: account })
        await registry.registerHermes(hermesOperator, hermesStake, hermesFee, minChannelStake, maxChannelStake, url, { from: account })
        const hermesAddress = await registry.getHermesAddress(hermesOperator)
        console.log('HermesID: ', hermesAddress)

        // Set hermes owner
        const hermes = await HermesImplementation.at(hermesAddress)
        await hermes.transferOwnership(MEGA_OWNER, { from: account })
    }
}
