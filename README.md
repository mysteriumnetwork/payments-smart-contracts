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

## Current deployment (ethereum Görli testnet)
MYSTT ERC20 Token (Mintable a la myst token): [0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb](https://goerli.etherscan.io/address/0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb)

Registry smart contract:
[0x611ad702f6A55C16A1bA6733a20D457488B5EAaF](https://goerli.etherscan.io/address/0x611ad702f6A55C16A1bA6733a20D457488B5EAaF)

### Deloyment log:

    $ npm run deploy

    Config address:  0xF8B0E425AB9BE026B67a6429F0C8E3394983EdA8

    Deploying 'SafeMathLib'
    -----------------------
    > transaction hash:    0x0efc3c829582706fd2c9e84b964d552e5712960ac2c77d3cb5e5a9c1a62f0e94
    > Blocks: 0            Seconds: 8
    > contract address:    0xd15b481BC48144345a376eA9C9dDCA698A32950b
    > block number:        1849152
    > block timestamp:     1576757423
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32954817792
    > gas used:            177563
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00019709493 ETH

    Linking
    -------
    * Contract: MystToken <--> Library: SafeMathLib (at address: 0xd15b481BC48144345a376eA9C9dDCA698A32950b)

    Deploying 'MystToken'
    ---------------------
    > transaction hash:    0x855817da9e6c30e0be5ae7d6e4b0e8a88370347e7e63c7373f49117ed35ccfab
    > Blocks: 1            Seconds: 8
    > contract address:    0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb
    > block number:        1849154
    > block timestamp:     1576757453
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32836215402
    > gas used:            1068490
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.0011860239 ETH

    Deploying 'MystDEX'
    -------------------
    > transaction hash:    0x7547b387da02569ef1a85596f71be07f7abcdb6514cff06f4151cc2d0dc6ccfe
    > Blocks: 1            Seconds: 12
    > contract address:    0xdB8fc76Affa54C27Cea72a689Cb03F40Bf854454
    > block number:        1849156
    > block timestamp:     1576757483
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32836215402
    > gas used:            831787
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00092328357 ETH

    Deploying 'ChannelImplementation'
    ---------------------------------
    > transaction hash:    0x05ee4d079ba9d4a017dc2d1d0d6b010ae763ef14a4ba4808c36a5f6bc77c7932
    > Blocks: 0            Seconds: 4
    > contract address:    0x0518D49B9c0619c7F7bD0745ac773C0f0B5Ac15F
    > block number:        1849158
    > block timestamp:     1576757513
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32563605063
    > gas used:            1624162
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00180281982 ETH

    Deploying 'AccountantImplementation'
    ------------------------------------
    > transaction hash:    0xd3abde93397da56b12a8ab6f2e1c2ac9ed318a7415c45989ac91859c6d9db0cf
    > Blocks: 0            Seconds: 4
    > contract address:    0x33eC8FEB494a25A965D8FB77bE48a9c1F35CA895
    > block number:        1849160
    > block timestamp:     1576757543
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32188399533
    > gas used:            3380230
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.0037520553 ETH

    Deploying 'ChannelImplementationProxy'
    --------------------------------------
    > transaction hash:    0x6d075b97eb2854f8f3f9c92e83d7d2ef7635d6756db8dcdbd00fa4892c3ee8f0
    > Blocks: 1            Seconds: 24
    > contract address:    0x5488774D8c7D170D4a8ecA89892c54b8DEca510b
    > block number:        1849163
    > block timestamp:     1576757588
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.32176620324
    > gas used:            106119
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00011779209 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0xc5462a2da6a6f0d9c3eb1482fe76098813f54101bea04dc49c274d701c3320bb
    > Blocks: 1            Seconds: 20
    > contract address:    0x611ad702f6A55C16A1bA6733a20D457488B5EAaF
    > block number:        1849170
    > block timestamp:     1576757693
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.3196179603
    > gas used:            1761921
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00195573231 ETH

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
