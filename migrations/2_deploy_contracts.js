const {BN} = require('web3-utils')

const MystToken = artifacts.require("MystToken")
const Registry = artifacts.require("Registry")

const deployRegistry = require("../scripts/deployRegistry")

module.exports = async function (deployer, network, accounts) {
    // Run this configurations only on Görli testnet
    if (network !== 'goerli' && network !== 'mumbai') {
        return
    }

    const tokenAddress = (network === 'mumbai') ? '0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8' : '0xf74a5ca65E4552CfF0f13b116113cCb493c580C5'
    const [registryAddress, _] = await deployRegistry(web3, accounts[0])
    const hermesOperator = "0xbFD2D96259De92B5817c83b7E1b756Ba8df1D59D"
    const token = await MystToken.at(tokenAddress)
    const registry = await Registry.at(registryAddress)

    // Register hermes with 5000 tokens stake, 20% tx fee and 100 max channel balance
    const hermesStake = web3.utils.toWei(new BN('5000'), 'ether') // 5000 tokens
    const hermesFee = 2000 // 20.00%
    const minChannelStake = web3.utils.toWei(new BN('1'), 'ether') // 1 token
    const maxChannelStake = web3.utils.toWei(new BN('100'), 'ether') // 100 tokens
    const url = Buffer.from('68747470733a2f2f746573746e6574332d6865726d65732e6d797374657269756d2e6e6574776f726b2f', 'hex') // https://testnet3-hermes.mysterium.network/
    await token.approve(registryAddress, hermesStake)
    await registry.registerHermes(hermesOperator, hermesStake, hermesFee, minChannelStake, maxChannelStake, url)
    console.log('HermesID: ', await registry.getHermesAddress(hermesOperator))
}
