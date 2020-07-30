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

MYSTTv2 ERC777 Token (migratable from MYSTTv1): [0x8EA3F639e98da04708520C63b34AfBAa1594bC82](https://goerli.etherscan.io/address/0x8EA3F639e98da04708520C63b34AfBAa1594bC82)

Registry smart contract:
[0x2FD2AbE2fF222b84db9B3fF8D37532A9417f244A](https://goerli.etherscan.io/address/0x2FD2AbE2fF222b84db9B3fF8D37532A9417f244A)

Hermes smart contract:
[0xF20e4068Aecb427481Dd35B36506d8AAcD5763E9](https://goerli.etherscan.io/address/0xF20e4068Aecb427481Dd35B36506d8AAcD5763E9)

### Deloyment log:

    $ npm run deploy

    Deploying 'MystToken'
    ---------------------
    > transaction hash:     0xfb91b38d2ceebe01e70242c33c512fd61643efac882bad6d5e8075049ad6f939
    > Blocks: 1            Seconds: 17
    > contract address:    0x8EA3F639e98da04708520C63b34AfBAa1594bC82
    > block number:        3135800
    > block timestamp:     1596093451
    > account:             0xe21fF182889B3d4F84865fB453D593c1c817583E
    > balance:             9.97762002578
    > gas used:            2770525 (0x2a465d)
    > gas price:           3.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00861633275 ETH

    Deploying 'MystDEX'
    -------------------
    > transaction hash:    0x89009439d2faf2036a5e34b1a10f5a282d484b928bf7862036af687161dadfe4
    > Blocks: 5            Seconds: 69
    > contract address:    0x01D18B5DC45c8846D51c5Ae4737f2Ba985D60988
    > block number:        3135805
    > block timestamp:     1596093526
    > account:             0xe21fF182889B3d4F84865fB453D593c1c817583E
    > balance:             9.97468061239
    > gas used:            945149 (0xe6bfd)
    > gas price:           3.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00293941339 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:     0x73dc4618db03d16097750d83e38916e17d8887f2656b50ff9152bf0782adfce9
    > Blocks: 2            Seconds: 41
    > contract address:    0x430fb4a8325adC064EF8AB95B09fDA258fF186C8
    > block number:        3135810
    > block timestamp:     1596093601
    > account:             0xe21fF182889B3d4F84865fB453D593c1c817583E
    > balance:             9.96902513026
    > gas used:            1818483 (0x1bbf73)
    > gas price:           3.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00565548213 ETH

    Deploying 'HermesImplementation'
    --------------------------------
    > transaction hash:    0xc26550a9f7a1465bee282ae22a23155cc5c53d9ba4512e4653b9262672c47204
    > Blocks: 2            Seconds: 25
    > contract address:    0x172f20402aFc807C8A5566bcEEd00831aDb938CA
    > block number:        3135813
    > block timestamp:     1596093646
    > account:             0xe21fF182889B3d4F84865fB453D593c1c817583E
    > balance:             9.95545804449
    > gas used:            4362407 (0x4290a7)
    > gas price:           3.11 gwei
    > value sent:          0 ETH
    > total cost:          0.01356708577 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0x1860531e8b3beb97698ae24eea7c7251baa9f201d710546152334cfd8e3b09b9
    > Blocks: 0            Seconds: 9
    > contract address:    0x2FD2AbE2fF222b84db9B3fF8D37532A9417f244A
    > block number:        3135815
    > block timestamp:     1596093676
    > account:             0xe21fF182889B3d4F84865fB453D593c1c817583E
    > balance:             9.94832885465
    > gas used:            2292344 (0x22fa78)
    > gas price:           3.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00712918984 ETH

## Ideas to discuss

* Integration with Uniswap V2 (`settleToDEX` in hermes).
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* GSN support.
