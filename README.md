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
[0xc82Cc5B0bAe95F443e33FF053aAa70F1Eb7d312A](https://goerli.etherscan.io/address/0xc82Cc5B0bAe95F443e33FF053aAa70F1Eb7d312A)

Hermes smart contract:
[0x42a537D649d6853C0a866470f2d084DA0f73b5E4](https://goerli.etherscan.io/address/0x42a537D649d6853C0a866470f2d084DA0f73b5E4)

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

    Deploying 'MystDEX'
    -------------------
    > transaction hash:    0x7b92491849c634d51921659a52aab79729de3808e1fc679d65e8c2751409c83b
    > Blocks: 1            Seconds: 12
    > contract address:    0x3D67671DEcE8052E550567e756522a5A5D47aC4E
    > block number:        3221689
    > block timestamp:     1597382128
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             58.04870459055
    > gas used:            852753 (0xd0311)
    > gas price:           7.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00606307383 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:    0xf175d7722ded600278c8bba661078165200109af26db15ae8ea3ab9c171cd4c4
    > Blocks: 0            Seconds: 12
    > contract address:    0x29a615aA7E03D8c04B24cc91B2949447D3A10bD6
    > block number:        3221691
    > block timestamp:     1597382158
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             58.04870459055
    > gas used:            1695993 (0x19e0f9)
    > gas price:           7.11 gwei
    > value sent:          0 ETH
    > total cost:          0.01205851023 ETH

    Deploying 'HermesImplementation'
    --------------------------------
    > transaction hash:    0x473aeb830e5717f25d551fb3ebb0abbc533839214dbb306a214bcae3f608639c
    > Blocks: 1            Seconds: 20
    > contract address:    0xD0DE507c2ea452f4c8CCa6244A5408bF7e2bB8ca
    > block number:        3221694
    > block timestamp:     1597382203
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             58.00647829344
    > gas used:            4243008 (0x40be40)
    > gas price:           7.11 gwei
    > value sent:          0 ETH
    > total cost:          0.03016778688 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0xfac5b69114e2f15288bdca381ed69dfef386cbd6323af89835b009f0c81a9dda
    > Blocks: 1            Seconds: 12
    > contract address:    0xc82Cc5B0bAe95F443e33FF053aAa70F1Eb7d312A
    > block number:        3221696
    > block timestamp:     1597382233
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             58.00647829344
    > gas used:            2177858 (0x213b42)
    > gas price:           7.11 gwei
    > value sent:          0 ETH
    > total cost:          0.01548457038 ETH

## Ideas to discuss

* Integration with Uniswap V2 (`settleToDEX` in hermes).
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* GSN support.
