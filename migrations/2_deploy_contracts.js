const { BN } = require('@openzeppelin/test-helpers')

const MystToken = artifacts.require("MystToken")
const Registry = artifacts.require("Registry")

module.exports = async function (deployer, network, accounts) {
    // Run this configurations only on Görli testnet
    if (network !== 'goerli' && network !== 'mumbai') {
        return
    }

    // const tokenAddress = "0xf74a5ca65E4552CfF0f13b116113cCb493c580C5"
    const tokenAddress = "0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8"
    const registryAddress = "0x0BcAd0a5eEb569B4D0f597d6EE31ec6ae043610e"
    const hermesOperator = "0xbFD2D96259De92B5817c83b7E1b756Ba8df1D59D"
    const token = await MystToken.at(tokenAddress)
    const registry = await Registry.at(registryAddress)

    // Register hermes with 5 tokens stake, 15% tx fee and 5000 max channel balance
    const hermesStake = web3.utils.toWei(new BN('500'), 'ether') // 500 tokens
    const hermesFee = 1500 // 15.00%
    const minChannelStake = web3.utils.toWei(new BN('1'), 'ether') // 1 token
    const maxChannelStake = web3.utils.toWei(new BN('100'), 'ether') // 100 tokens
    const url = Buffer.from('68747470733a2f2f746573746e6574332d6865726d65732e6d797374657269756d2e6e6574776f726b2f', 'hex') // https://testnet3-hermes.mysterium.network/
    await token.approve(registryAddress, hermesStake)
    await registry.registerHermes(hermesOperator, hermesStake, hermesFee, minChannelStake, maxChannelStake, url)
    console.log('HermesID: ', await registry.getHermesAddress(hermesOperator))
}
