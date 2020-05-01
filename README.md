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

## Current deployment (ethereum Görli testnet)
MYSTT ERC20 Token (Mintable a la myst token): [0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb](https://goerli.etherscan.io/address/0x7753cfAD258eFbC52A9A1452e42fFbce9bE486cb)

Registry smart contract:
[0x3dD81545F3149538EdCb6691A4FfEE1898Bd2ef0](https://goerli.etherscan.io/address/0x3dD81545F3149538EdCb6691A4FfEE1898Bd2ef0)

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
    > transaction hash:    0x9208c1600b2e144a3c0755c53d5f3fe7e391e0ef70ab2c404fad41e0a54d8aca
    > Blocks: 0            Seconds: 8
    > contract address:    0x3026eB9622e2C5bdC157C6b117F7f4aC2C2Db3b5
    > block number:        1850097
    > block timestamp:     1576771600
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.2873691004
    > gas used:            106119
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00011779209 ETH

    Deploying 'AccountantImplementationProxy'
    -----------------------------------------
    > transaction hash:    0xbbb0a497c14094ff1cd2d7619733272b246d53be909d381fb27de77f4e9be62f
    > Blocks: 1            Seconds: 24
    > contract address:    0xDc36899A6cEea1A0F729467ba134d92f6E42FF53
    > block number:        1850100
    > block timestamp:     1576771645
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.28725130831
    > gas used:            106119
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00011779209 ETH

    Deploying 'Registry'
    --------------------
    > transaction hash:    0xed00a8f7b50e82e93d66a43544f2be63cf2013f45090207c4e42c8138cfb31c7
    > Blocks: 3            Seconds: 40
    > contract address:    0x3dD81545F3149538EdCb6691A4FfEE1898Bd2ef0
    > block number:        1850111
    > block timestamp:     1576771810
    > account:             0x4b902507cc9F6C18c2f0f1cb170315276D6a7eFe
    > balance:             6.2852082523
    > gas used:            1697491
    > gas price:           1.11 gwei
    > value sent:          0 ETH
    > total cost:          0.00188421501 ETH

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
* Get fee from channel during deployment instead of from `msg.sender`.
* `msg.sender` could get reward for registration directly from channel during `initialize` stage.
