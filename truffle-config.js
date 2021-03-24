const HDWalletProvider = require("@truffle/hdwallet-provider");
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
            version: "0.7.6",
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
        test: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*"
        },
        e2e: {
            host: "ganache",
            port: 8545,
            network_id: "*",
        }
    }
};
