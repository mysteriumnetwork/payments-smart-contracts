# Mysterium Network payments [![Build Status](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts.svg?token=t9FwiYsxwDxkJWnSMpfr&branch=master)](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts)

Set of smart contracts needed for mysterium identity registration and working with payment channels (using payment hubs).

## Documentation

* [Payments solution white paper](docs/paper/accountant-pattern.pdf)
* [Smart contracts API description](docs/smart-contracts.md)
* [Requirements/prerequisites of payment solution](docs/prerequisites.md)
* [Registration flow (technical)](docs/registration-flow.md)

## Setup and test

We're using truffle for smart contract compilation and running tests.

1. Install dependencies

```bash
npm install
```

2. Run local ethereum node, e.g. `ganache`. Make sure to use version greater than 6.9.1.

```bash
npx ganache-cli --port 7545 --mnemonic "amused glory pen avocado toilet dragon entry kitchen cliff retreat canyon danger"
```

3. Run tests

```bash
npm test
```

4. Testing migration/deployment
```bash
npm run migrate
```

## Current deployment (ethereum Görli testnet)

MYSTT ERC20 Token (Mintable a la myst token): [0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb](https://goerli.etherscan.io/address/0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb)

MYSTTv2 Token: [0xf74a5ca65E4552CfF0f13b116113cCb493c580C5](https://goerli.etherscan.io/address/0xf74a5ca65E4552CfF0f13b116113cCb493c580C5)

Registry smart contract:
[0x15B1281F4e58215b2c3243d864BdF8b9ddDc0DA2](https://goerli.etherscan.io/address/0x15B1281F4e58215b2c3243d864BdF8b9ddDc0DA2)

Hermes smart contract:
[0xD5d2f5729D4581dfacEBedF46C7014DeFda43585](https://goerli.etherscan.io/address/0xD5d2f5729D4581dfacEBedF46C7014DeFda43585)

### Deloyment log:

    $ npm run deploy

    Deploying 'MystToken'
    ---------------------
    > transaction hash:    0x861a8a1bd27100d16c8acbb898ff2517c56ddfd25689580d8c05b35344cdec32
    > Blocks: 0            Seconds: 8
    > contract address:    0xf74a5ca65E4552CfF0f13b116113cCb493c580C5
    > block number:        3221687
    > block timestamp:     1597382098
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             58.05476766438
    > gas used:            1741733 (0x1a93a5)
    > gas price:           7.11 gwei
    > value sent:          0 ETH
    > total cost:          0.01238372163 ETH


    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:    0x3768aaa035b649a29851f5ce46fae81d248fb60ad1b34912fb8d80aa625ec7e6
    > Blocks: 0            Seconds: 9
    > contract address:    0xc49B987fB8701a41ae65Cf934a811FeA15bCC6E4
    > block number:        3683806
    > block timestamp:     1604329351
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             27.0734565148
    > gas used:            1999086 (0x1e80ee)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00221898546 ETH

    Deploying 'HermesImplementation'
    --------------------------------
    > transaction hash:    0x877a8cd2e35769405c98ce7a1d194c033cc750af49b65b04da194d261b066592
    > Blocks: 2            Seconds: 26
    > contract address:    0xcf3a0563d5A31Ea838e8a2f27825Cb8d0658b392
    > block number:        3683809
    > block timestamp:     1604329396
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             27.06741866869
    > gas used:            3440415 (0x347f1f)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00381886065 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0x4c2bbe6bab43fe98a2ee3a7a24233bbc13b6795866b1520c2c1bf90c92c7c393
    > Blocks: 1            Seconds: 13
    > contract address:    0x15B1281F4e58215b2c3243d864BdF8b9ddDc0DA2
    > block number:        3683811
    > block timestamp:     1604329426
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             27.06456969829
    > gas used:            2566640 (0x2729f0)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.0028489704 ETH
