const { 
    generatePrivateKey,
    privateToPublic,
    toAddress
} = require('./index.js')

function generateWallet() {
    const privKey = generatePrivateKey()
    const pubKey = privateToPublic(privKey)
    const address = toAddress(pubKey)
    return { privKey, pubKey, address }
}

module.exports = {
    generateWallet
}
