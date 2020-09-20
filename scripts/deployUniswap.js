const deployFactoryTx = require('./UniswapV2Factory.json')
const deployRouter01Tx = require('./UniswapV2Router01.json')
const deployMigratorTx = require('./UniswapV2Migrator.json')
const deployRouter02Tx = require('./UniswapV2Router02.json')

deploy = async (web3, account = undefined) => {
    if (!account) {
        account = (await web3.eth.getAccounts())[0]
    }

    // Deploy uniswap factory
    const deployedFactoryCode = await web3.eth.getCode(deployFactoryTx.contractAddr)
    if (deployedFactoryCode.length <= 3) {
        // If factory is not there, it is first tx sender's transaction, lets give him some ethers for gas
        await web3.eth.sendTransaction({
            from: account, to: deployFactoryTx.sender, value: '300000000000000000' /* web3.utils.toWei(0.3) */
        })
        await web3.eth.sendSignedTransaction(deployFactoryTx.rawTx)
    }

    // Deploy uniswap router01
    const deployedRouter01Code = await web3.eth.getCode(deployRouter01Tx.contractAddr)
    if (deployedRouter01Code.length <= 3) {
        await web3.eth.sendSignedTransaction(deployRouter01Tx.rawTx)
    }

    // Deploy uniswap migrator
    const deployedMigratorCode = await web3.eth.getCode(deployMigratorTx.contractAddr)
    if (deployedMigratorCode.length <= 3) {
        await web3.eth.sendSignedTransaction(deployMigratorTx.rawTx)
    }

    // Deploy uniswap router02
    const deployedRouter02Code = await web3.eth.getCode(deployRouter02Tx.contractAddr)
    if (deployedRouter02Code.length <= 3) {
        await web3.eth.sendSignedTransaction(deployRouter02Tx.rawTx)
    }
}

module.exports.deploy = deploy
