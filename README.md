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

2. Run local ethereum node, e.g. `ganache`.

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

## Current deployment (ethereum Kovan testnet)
ERC20 Token (Mintable a la myst token): [0x045A6fcb75a53db17E5013B7d2DC6ad69381a151](https://kovan.etherscan.io/address/0xE67e41367c1e17ede951A528b2A8BE35c288c787)

Registry smart contract:
[0xdB8fc76Affa54C27Cea72a689Cb03F40Bf854454](https://kovan.etherscan.io/address/0xdB8fc76Affa54C27Cea72a689Cb03F40Bf854454)

### Deloyment log:

    $ npm run deploy

    Deploying 'SafeMathLib'
    -----------------------
    > transaction hash:    0xf8aaf4e1f3443874e75aa44fd28107c8a28b5168be6341206afcd17e69dad8a7
    > Blocks: 1            Seconds: 4
    > contract address:    0x3BC2e91d67B924506bc0aB9d61B8c7D1b291538E
    > block number:        14358116
    > block timestamp:     1571954468
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.9952566778
    > gas used:            224802
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.0047433222 ETH

    Linking
    -------
    * Contract: MystToken <--> Library: SafeMathLib (at address: 0x3BC2e91d67B924506bc0aB9d61B8c7D1b291538E)

    Deploying 'MystToken'
    ---------------------
    > transaction hash:    0x856fe41aa4047450de88eb321382371f4f7a9d957e66a5dba8ae245d7f0aff99
    > Blocks: 0            Seconds: 0
    > contract address:    0xE67e41367c1e17ede951A528b2A8BE35c288c787
    > block number:        14358119
    > block timestamp:     1571954480
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.9527568046
    > gas used:            2014212
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.0424998732 ETH

    Deploying 'MystDEX'
    -------------------
    > transaction hash:    0x423d75441f5afd4cbe654911a7421bcfa2f54cc91fe57b344c80319f85c6485a
    > Blocks: 2            Seconds: 4
    > contract address:    0xd4c045E21aa8350A404e686356F00DA442C83f56
    > block number:        14358123
    > block timestamp:     1571954496
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.9239150669
    > gas used:            1366907
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.0288417377 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:    0xc6cd955adf7053f0e9f15caef3f3dfdfd90701968c4bf0e71d80e768e2a71a23
    > Blocks: 0            Seconds: 0
    > contract address:    0xd15b481BC48144345a376eA9C9dDCA698A32950b
    > block number:        14358127
    > block timestamp:     1571954512
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.8681689724
    > gas used:            2641995
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.0557460945 ETH

    Deploying 'AccountantImplementation'
    ------------------------------------
    > transaction hash:    0x9f4a11c2f2d1a9a550f8788a086ced94436048dfd6218a0438c7e82806de4297
    > Blocks: 1            Seconds: 4
    > contract address:    0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb
    > block number:        14358131
    > block timestamp:     1571954528
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.7560186111
    > gas used:            5315183
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.1121503613 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0x7abc80a718a96f64cfa496fc4f654c7a2dd4326226a26ae96addd4ad14630ba2
    > Blocks: 0            Seconds: 4
    > contract address:    0xdB8fc76Affa54C27Cea72a689Cb03F40Bf854454
    > block number:        14358135
    > block timestamp:     1571954544
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             0.6974369509
    > gas used:            2776382
    > gas price:           21.1 gwei
    > value sent:          0 ETH
    > total cost:          0.0585816602 ETH

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
