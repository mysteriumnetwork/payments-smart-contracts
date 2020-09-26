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
npx ganache-cli --port 7545 --mnemonic "annual soul loop stay behave write peanut such laptop drum evoke few"
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
[0x3cDE3efdEbb688C81355910330A6624927C88597](https://goerli.etherscan.io/address/0x3cDE3efdEbb688C81355910330A6624927C88597)

Hermes smart contract:
[0xF2f4dA076c2AA3A26f71Eb172c34Cb425c2d5495](https://goerli.etherscan.io/address/0xF2f4dA076c2AA3A26f71Eb172c34Cb425c2d5495)

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
    > transaction hash:    0x62fe01ae5a0ebaf03a99ec791c8ab5cf3aa7b7259cf08c97285b44f0188f8721
    > contract address:    0x5135a9032acdEA1eD4E134aa0460Cf259D00F4a6
    > block number:        3469791
    > block timestamp:     1601118607
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             4.98748921775
    > gas used:            2097142 (0x1ffff6)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00232782762 ETH

    Deploying 'HermesImplementation'
    --------------------------------
    > transaction hash:    0xbee1004629586559459022f7de3406a78c190816bbce164477dcc292c2dc7911
    > contract address:    0x656299Dee670940D4B5AE4e30eb3dA6AF997d2ff
    > block number:        3469793
    > block timestamp:     1601118637
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             4.98256376591
    > gas used:            4437344 (0x43b560)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00492545184 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0xb387cb5267490f761acaa08649a6cb27a5a90915d0f7b02f3b581f553524b541
    > contract address:    0x3cDE3efdEbb688C81355910330A6624927C88597
    > block number:        3469795
    > block timestamp:     1601118667
    > account:             0x3D0A081720aC75fC8d66714F92f7ccc993EeB53D
    > balance:             4.97986807097
    > gas used:            2428554 (0x250e8a)
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00269569494 ETH
