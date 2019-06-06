# Mysterium Network payments [![Build Status](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts.svg?token=t9FwiYsxwDxkJWnSMpfr&branch=master)](https://travis-ci.com/mysteriumnetwork/payments-smart-contracts)

Set of smart contracts needed for mysterium identity registration and working with payment channels (using payment hubs).

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

## FEATURES

**Registry**

* [x] Register Accountant
* [x] Register Identity
* [x] Deploy channel contract during identity registration
* [x] Open incomming channel (for providers) if identity is willing to stake/lend/deposit some funds for accountant
* [x] Deploy accountant contract during accountant registration
* [x] Check if given identity is registered
* [x] Check if given accountant is registered and active
* [x] Possibility to set and change registration fee
* [x] Collected fees can be transfered into beneficiary address given by registry owner

**Channels**

* [x] One directional (promises bases) payment channels between consumer and accountant.
* [x] Support of hashlocks in smart contracts.
* [x] Fast funds withdwaral via settle promises.
* [x] Timelocks for consumer withdwarals/exists.
* [x] Cheap deployment using miniProxy (EIP1167).
* [x] Funds (ethers and tokens accidentially send) recovery via channel operator signature.
* [ ] Possibility to change accountant.
* [ ] Multiple paying (consumer -> accountant) channels with different accountants.
* [x] Possibility to touch `dex` contract on ether topups.

**Accountant**

* [x] Cheap deployment using miniProxy (EIP1167).
* [x] One directional (promises bases) payment channels between accountant and provider.
* [x] Support of hashlocks in smart contracts.
* [x] Fast funds withdwaral via settle promises.
* [x] Opening channels with deposits to guarantee available channel's balance.
* [x] Channel rebalance for accountant operator.
* [x] Persmissionaless channel balance incerease to `deposited/lended` amount.
* [x] Deposit/loans management (increase, return).
* [ ] Funds withdrawal/release.
* [x] Funds (ethers and tokens accidentially send) recovery via accountant operator signature.

**DEX**

* [x] Exchange ethers send to it into tokens.
* [x] DEX owner can set exchange rate.
* [x] Possibility to change DEX implementation in the future.

## TASKS TO DO

*[x] Opening channel should automatically do allowance for hub's tokens.
*[ ] README on how to use smart-contracts (main idea of our payments method).
*[ ] Add `green path` end-to-end test which will cover success flow from register till withdrawal
*[ ] Add tests for __upgradeToAndCall proxy function
*[ ] Deploy smart contracts into Ropsten
*[ ] Use method to deploy implementations into predefined addresses (like in ERC1820), so tests
would be simpler and smart contracts would avoid not necessary calculations.

## Ideas to discuss

* Bidable DEX (no centralised rate, each bidder can suggest own rate, conversion always on market price)
* Stateless Proxy (mutates target's storage, avoids delegatecall)
* Downvoting for provider identity (if client already paid some amount to identity) -> downvoting can take some funds from stake
* Virtual channels (Counterfactually or Perun based).
