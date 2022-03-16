const { BN } = require('web3-utils')

const MystToken = artifacts.require("MystToken")
const Registry = artifacts.require("Registry")
const ChannelImplementation = artifacts.require("ChannelImplementation")
const HermesImplementation = artifacts.require("HermesImplementation")

const tokenAddr = {
    mumbai: '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8',
    goerli: '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5',
    polygon: '0x1379e8886a944d2d9d440b3d88df536aea08d9f3',
    ethereum: '0x4cf89ca06ad997bc732dc876ed2a7f26a9e7f361'
}

// Hermes operator is signing hermes payment promises. Change it before actual deployment.
const HERMES_OPERATOR = '0x133cd135ebfaaf074c0068edefb1ca6d22112490'
const MEGA_OWNER = '0xC6b139344239b9E33F8dec27DE5Bd7E2a45F0374'

const deployNewImplementation = false
module.exports = async function (deployer, network, accounts) {
    const account = accounts[0]

    if (deployNewImplementation) {
        // Deploy Channel implementation into blockchain
        await deployer.deploy(ChannelImplementation, { from: account })

        const tokenAddress = tokenAddr[network]
        const registryAddress = '0x87F0F4b7e0FAb14A565C87BAbbA6c40c92281b51'
        const hermesImplementationAddress = '0x213a1B1d08F2715aE054ade98DEEd8a8F1cc937E'
        const hermesOperator = HERMES_OPERATOR
        const token = await MystToken.at(tokenAddress)
        const registry = await Registry.at(registryAddress)

        // Set new channel implementation
        await registry.setImplementations(ChannelImplementation.address, hermesImplementationAddress)

        // Register new hermes
        const hermesStake = web3.utils.toWei(new BN('1000'), 'ether') //  1000 tokens
        const hermesFee = 2000 // 20.00%
        const minChannelStake = web3.utils.toWei(new BN('0'), 'ether') // 0 token
        const maxChannelStake = web3.utils.toWei(new BN('100'), 'ether') // 100 tokens
        const url = Buffer.from('68747470733a2f2f6865726d6573322e6d797374657269756d2e6e6574776f726b2f', 'hex') // https://hermes2.mysterium.network/
        await token.approve(registryAddress, hermesStake, { from: account })
        await registry.registerHermes(hermesOperator, hermesStake, hermesFee, minChannelStake, maxChannelStake, url, { from: account })
        const hermesAddress = await registry.getHermesAddress(hermesOperator)
        console.log('HermesID: ', hermesAddress)

        // Set hermes owner
        const hermes = await HermesImplementation.at(hermesAddress)
        await hermes.transferOwnership(MEGA_OWNER, { from: account })
    }
}
