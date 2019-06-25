# Mysterium Network payments [![Build Status](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts.svg?token=t9FwiYsxwDxkJWnSMpfr&branch=master)](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts)

Set of smart contracts needed for mysterium identity registration and working with payment channels (using payment hubs).

## Documentation

* [Payments solution white paper](docs/paper/accountant-pattern.pdf)

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
[0x6bb8345C9D996be4FAb652f4A15813303d630b66](https://ropsten.etherscan.io/address/0x6bb8345c9d996be4fab652f4a15813303d630b66)


### Deloyment log:

    $ npm run deploy

    Deploying 'MystDEX'
    -------------------
    > transaction hash:     0x2b06097c17125713d2f4ca4256ae89f2f2d2660a8ed4291117938ece7d062839
    > Blocks: 1            Seconds: 8
    > contract address:    0xA2067b45cbF1379F791F4E373D95dbbdB365141A
    > block number:        5860790
    > block timestamp:     1561471166
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.920791189
    > gas used:            1606267
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.001606267 ETH

    Deploying 'DEXProxy'
    --------------------
    > transaction hash:  0x8230bf3aac108b918e97cc8040b23c28d9fac86173a9ebf1aa5f6f6d9c8919fa
    > Blocks: 4            Seconds: 73
    > contract address:    0x51F8992FA4e10b24b0D1fB5EDf637544a07b96c8
    > block number:        5860797
    > block timestamp:     1561471285
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.920184436
    > gas used:            606753
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.000606753 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:     0xa26384349bd1fa734f8d6cd6911e8e38afff687dd55539c9c16fdec4c273c9cf
    > Blocks: 0            Seconds: 28
    > contract address:    0x99A73D53959a8FCBE6e67631D39DE3cffD3ac9A2
    > block number:        5860800
    > block timestamp:     1561471332
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.916997487
    > gas used:            3186949
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.003186949 ETH

    Deploying 'AccountantImplementation'
    ------------------------------------
    > transaction hash:     0x088d97bd66fcaf28e3e90cb909f1244964fd6d56692f79dc081ad22f04567bd3
    > Blocks: 1            Seconds: 5
    > contract address:    0xBD946BfCA42746CDC237De10e9D2be84C9A586f7
    > block number:        5860802
    > block timestamp:     1561471342
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.912130043
    > gas used:            4867444
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.004867444 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:     0x5a812ffa82a935e4dab39ef37469194e04ad7b6d2fa627768f9b24fd06b147f8
    > Blocks: 3            Seconds: 45
    > contract address:    0x6bb8345C9D996be4FAb652f4A15813303d630b66
    > block number:        5860806
    > block timestamp:     1561471396
    > account:             0x4c41f8CB6dB9541004c0B2152D07cD1F2904d33d
    > balance:             3.908931314
    > gas used:            3198729
    > gas price:           1 gwei
    > value sent:          0 ETH
    > total cost:          0.003198729 ETH


## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
