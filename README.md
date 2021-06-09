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

2. Run local ethereum node, e.g. `ganache`. Make sure to use version greater than 6.12.2.

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

## Current deployment (ethereum Görli and polygon Mumbai testnets)

MYSTT on Görli: [0xf74a5ca65E4552CfF0f13b116113cCb493c580C5](https://goerli.etherscan.io/address/0xf74a5ca65E4552CfF0f13b116113cCb493c580C5)
MYSTT on Mumbai: [0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8](https://explorer-mumbai.maticvigil.com/tokens/0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8/token-transfers)

Registry smart contract:
- Görli: [0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39](https://goerli.etherscan.io/address/0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39)
- Mumbai: [0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39](https://explorer-mumbai.maticvigil.com/address/0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39/transactions)

Hermes smart contract:
- Görli [0xc198d5539B335c48A0eAF49136dF2f5cED3B160d](https://goerli.etherscan.io/address/0xc198d5539B335c48A0eAF49136dF2f5cED3B160d)
- Mumbai [0xc198d5539B335c48A0eAF49136dF2f5cED3B160d](https://explorer-mumbai.maticvigil.com/address/0xc198d5539B335c48A0eAF49136dF2f5cED3B160d/transactions)

Implementation addresses:
- Hermes implementation address (same on both networks): `0x72227c86B8B6C0cA292C3631679a5DdB20433cb3`
- Channel implementation address (Görli): `0x1aDF7Ef34b9d48DCc8EBC47D989bfdE55933B6ea`
- Channel implementation address (Mumbai): `0xf8982Ba93D3d9182D095B892DE2A7963eF9807ee`
