const MystToken = artifacts.require("MystToken")
const Registry = artifacts.require("Registry")

module.exports = async function (deployer, network, accounts) {
    // Run this configurations only on Görli testnet
    if (network !== 'goerli') {
        return
    }

    const tokenAddress = "0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb"
    const registryAddress = "0x3dD81545F3149538EdCb6691A4FfEE1898Bd2ef0"
    const accountantOperator = "0xfb9cbd471f27e69f9ca94c7e804601a1f87d0569"
    const transactorOperator = "0x0828d0386c1122e565f07dd28c7d1340ed5b3315"

    const token = await MystToken.at(tokenAddress)
    const registry = await Registry.at(registryAddress)

    // Mint tokens
    // await token.mint(accounts[0], '2000000000000000')

    // Topup transactor
    await token.transfer(transactorOperator, '100000000000000')

    // Register accountant with 100.000 tokens stake, 3% tx fee and 5000 max channel balance
    await token.approve(registryAddress, '100000000000000')
    await registry.registerAccountant(accountantOperator, 10000000000000, 300, 500000000000)
    console.log('AccountantID: ', await registry.getAccountantAddress(accountantOperator))
}
