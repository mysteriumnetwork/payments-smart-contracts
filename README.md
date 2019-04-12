# Mysterium Network payments [![Build Status](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts.svg?token=t9FwiYsxwDxkJWnSMpfr&branch=master)](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts)

Set of smart contracts needed for mysterium identity registration and promise/checque settling (one directional channels).

## Documentation

* [Basic flow](docs/main.md)
* [Staking](docs/staking.md)
* [Accountant pattern](docs/accountant-pattern.md)

## Setup and test

We're using truffle for contract compilation and running tests.

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
ERC20 Token (Mintable a la myst token): [https://ropsten.etherscan.io/address/0x453c11c058f13b36a35e1aee504b20c1a09667de](https://ropsten.etherscan.io/address/0x453c11c058f13b36a35e1aee504b20c1a09667de)

Registry smart contract: 


## TODO

* Refactoring to implement accountant pattern
* Staking (without punishments) instead of registration fee
* README on how to use smart-contracts (main idea of payments)
* Add `green path` end-to-end test which will cover success flow from register till withdrawal
* Bounty or fee for registration tx sender
* Add tests for __upgradeToAndCall proxy function
* Deploy smart contracts

## Ideas to discuss

* Staking with timelock for withdrawals and settlement
* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
