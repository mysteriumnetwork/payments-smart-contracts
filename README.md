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
npx ganache-cli --hardfork istanbul --port 7545 --mnemonic "amused glory pen avocado toilet dragon entry kitchen cliff retreat canyon danger"
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
MYSTT ERC20 Token (Mintable a la myst token): [0xE67e41367c1e17ede951A528b2A8BE35c288c787](https://kovan.etherscan.io/address/0xE67e41367c1e17ede951A528b2A8BE35c288c787)

Registry smart contract:
[0x1Da4C260e0ed55d8Bd564726Cc9133880dc8A099](https://kovan.etherscan.io/address/0x1Da4C260e0ed55d8Bd564726Cc9133880dc8A099)

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
    > transaction hash:    0xe8fbaa6cde7e7d83cd66ebec40b8bc049bfd3d6a03a6865a3ba757ac78ca310d
    > Blocks: 1            Seconds: 4
    > contract address:    0xE285d2929c1A3e6a419C9ddA73bc476b793EFdA8
    > block number:        14479179
    > block timestamp:     1572440736
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             1.69585796341
    > gas used:            832231
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00092377641 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:    0x005c5dbf78aa42c27554f4a265f4d17bd97199595a9d47a36c0098db39c766a1
    > Blocks: 0            Seconds: 0
    > contract address:    0x611ad702f6A55C16A1bA6733a20D457488B5EAaF
    > block number:        14479185
    > block timestamp:     1572440760
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             1.69361616745
    > gas used:            1625872
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00180471792 ETH

    Deploying 'AccountantImplementation'
    ------------------------------------
    > transaction hash:    0x4863848d2b52c1a0a12546aa2b4a5aa73d8df1be4656af95a7667aa2c94ee04b
    > Blocks: 0            Seconds: 0
    > contract address:    0x2C122A9655d7d30954F4ac1eC8e6f00D1e55E901
    > block number:        14479188
    > block timestamp:     1572440772
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             1.68986387239
    > gas used:            3380446
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00375229506 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0xc21617f63c9ace1c19345dec54ebeaeb708269cc7bb15ae59db6e56e400680a0
    > Blocks: 1            Seconds: 4
    > contract address:    0x1Da4C260e0ed55d8Bd564726Cc9133880dc8A099
    > block number:        14479192
    > block timestamp:     1572440788
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             1.68803039992
    > gas used:            1651777
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00183347247 ETH

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
