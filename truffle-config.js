const HDWalletProvider = require("@truffle/hdwallet-provider");
// const INFURA_URL = "https://ropsten.infura.io/v3/...";
// const INFURA_URL = "https://goerli.infura.io/v3/048b64dd20b7446e9f0ce3a4c79ea13d"
const INFURA_URL = "https://rpc-mumbai.maticvigil.com/v1/bbcd3ff12e1afcce954866c7a51a129c0cfccb5f";
const INFURA_URL = "https://ropsten.infura.io/v3/...";
const mnemonic = "amused glory pen avocado toilet dragon entry kitchen cliff retreat canyon danger";

module.exports = {
    // Uncommenting the defaults below
    // provides for an easier quick-start with Ganache.
    // You can also follow this format for other networks;
    // see <http://truffleframework.com/docs/advanced/configuration>
    // for more details on how to specify configuration options!

    compilers: {
        solc: {
            version: "0.8.4",
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200
                },
            }
        }
    },
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*",
            disableConfirmationListener: true
        },
        ropsten: {
            provider: () => new HDWalletProvider(mnemonic, INFURA_URL),
            network_id: 3,
            gas: 5000000,
            gasPrice: 3000000000,
            confirmations: 1,
            sipDryRun: true
        },
        goerli: {
            provider: () => new HDWalletProvider(mnemonic, INFURA_URL),
            network_id: 5,
            gas: 5000000,
            gasPrice: 1110000000,
            confirmations: 1,
            skipDryRun: true
        },
        mumbai: {
            provider: () => new HDWalletProvider(mnemonic, INFURA_URL),
            network_id: 80001,
            gas: 5000000,
            gasPrice: 1110000000,
            confirmations: 1,
            skipDryRun: true
        },
        test: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*"
        },
        e2e: {
            host: "ganache",
            port: 8545,
            network_id: "*",
            disableConfirmationListener: true
        }
    }
};
