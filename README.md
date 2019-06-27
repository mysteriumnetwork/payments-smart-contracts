# Mysterium Network payments [![Build Status](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts.svg?token=t9FwiYsxwDxkJWnSMpfr&branch=master)](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts)

Set of smart contracts needed for mysterium identity registration and working with payment channels (using payment hubs).

## Documentation

* [Payments solution white paper](docs/paper/accountant-pattern.pdf)
* [Smart contracts API description](docs/main.md)

## Setup and test

We're using truffle for smart contract compilation and running tests.

1. Install dependencies

```bash
npm install
```

2. Run local ethereum node, e.g. `ganache`.

```bash
npx ganache-cli --port 7545
```

3. Run tests

```bash
npm test
```

4. Testing migration/deployment
```bash
npm run migrate
```

## Current deployment (ethereum Ropsten testnet)

ERC20 Token (Mintable a la myst token): [0x453c11c058f13b36a35e1aee504b20c1a09667de](https://ropsten.etherscan.io/address/0x453c11c058f13b36a35e1aee504b20c1a09667de)

Registry smart contract:
[0xE6b3a5c92e7c1f9543A0aEE9A93fE2F6B584c1f7](https://ropsten.etherscan.io/address/0xe6b3a5c92e7c1f9543a0aee9a93fe2f6b584c1f7)


### Deloyment log:

    $ npm run deploy

    Deploying 'MystDEX'
    -------------------
    > transaction hash:     0x5b0880c3c3915a6b0b19f8cbdb0e4176d7dcb4fe31522587b7261433eccb43f1
    > Blocks: 1            Seconds: 12
    > contract address:    0x5C6881e2811E530D9067cC151981A9C27fAf31A9
    > block number:        5872378
    > block timestamp:     1561624076
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.89145553
    > gas used:            1606267
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.001606267 ETH

    Deploying 'DEXProxy'
    --------------------
    > transaction hash:     0x44b9c337a4cf9ef5dc663e6cf5d33e1fb09edf91a53b8a5caa89033ab54e8a08
    > Blocks: 1            Seconds: 40
    > contract address:    0xC30F3519F43F704E6224b0DB3982c1c494a90d0A
    > block number:        5872382
    > block timestamp:     1561624140
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.890848777
    > gas used:            606753
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.000606753 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:     0x4cf0667775ea6d5628b8394a8898f394f192aaa5d15eb550ad1c6a48b746b77b
    > Blocks: 0            Seconds: 4
    > contract address:    0xa26b684d8dBa935DD34544FBd3Ab4d7FDe1C4D07
    > block number:        5872384
    > block timestamp:     1561624157
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.887661828
    > gas used:            3186949
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.003186949 ETH

    Deploying 'AccountantImplementation'
    ------------------------------------
    > transaction hash:     0x4c2e9d176bd3042218ed60c91982ff1f4f68610723b6762dcc64bc35218521ae
    > Blocks: 5            Seconds: 16
    > contract address:    0x5a10863FeB6f3BcaEe9C960D0c24F4887cF15053
    > block number:        5872390
    > block timestamp:     1561624204
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.88279432
    > gas used:            4867508
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.004867508 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:     0x5cf539ea4cf46c7b476fa456e6935e158f4d65be191c27214c80e57bdc7cb503
    > Blocks: 1            Seconds: 24
    > contract address:    0xE6b3a5c92e7c1f9543A0aEE9A93fE2F6B584c1f7
    > block number:        5872394
    > block timestamp:     1561624257
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.879662274
    > gas used:            3132046
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.003132046 ETH

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
