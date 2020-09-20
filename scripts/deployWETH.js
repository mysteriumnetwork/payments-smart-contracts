const deployTx = require('./WETH.json')

deploy = async (web3, account = undefined) => {
    const deployedCode = await web3.eth.getCode(deployTx.contractAddr)
    if (!account) {
        account = (await web3.eth.getAccounts())[0]
    }

    if (deployedCode.length <= 3) {
        await web3.eth.sendTransaction({
            from: account, to: deployTx.sender, value: '100000000000000000'/* web3.utils.toWei(0.1) */
        })
        await web3.eth.sendSignedTransaction(deployTx.rawTx)
    }
}

module.exports.deploy = deploy