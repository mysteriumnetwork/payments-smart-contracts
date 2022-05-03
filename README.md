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
npx ganache-cli --port 8545 --mnemonic "amused glory pen avocado toilet dragon entry kitchen cliff retreat canyon danger"
```

3. Run tests

```bash
npm test
```

4. Testing migration/deployment
```bash
npm run migrate
```

## MainNet deployment

Registry smart contract:
- Polygon [0x87F0F4b7e0FAb14A565C87BAbbA6c40c92281b51](https://polygonscan.com/address/0x87F0F4b7e0FAb14A565C87BAbbA6c40c92281b51)
- Ethereum [0x87F0F4b7e0FAb14A565C87BAbbA6c40c92281b51](https://etherscan.io/address/0x87f0f4b7e0fab14a565c87babba6c40c92281b51)

Hermes smart contract
- V1 on Polygon [0xa62a2A75949d25e17C6F08a7818e7bE97c18a8d2](https://polygonscan.com/address/0xa62a2a75949d25e17c6f08a7818e7be97c18a8d2)
- V1 on Ethereum [0xa62a2A75949d25e17C6F08a7818e7bE97c18a8d2](https://etherscan.io/address/0xa62a2A75949d25e17C6F08a7818e7bE97c18a8d2)
- V2 on Polygon [0xDe82990405aCc36B4Fd53c94A24D1010fcc1F83d](https://polygonscan.com/address/0xDe82990405aCc36B4Fd53c94A24D1010fcc1F83d)
- V3 on Polygon [0x80ed28d84792d8b153bf2f25f0c4b7a1381de4ab](https://polygonscan.com/address/0x80ed28d84792d8b153bf2f25f0c4b7a1381de4ab)


Implementation addresses:
- Hermes implementation address (same on both networks): `0x213a1B1d08F2715aE054ade98DEEd8a8F1cc937E`
- Hermes implementation v3 address (Polygon only): `0x4f7265afc1373317975a306023574BE5Ec87157A`
- Channel implementation address (Polygon): `0x25882f4966065ca13b7bac15cc48391d9a4124f6`
- Channel implementation v2 address (Polygon): `0x813d3A0ef42FD4F25F2854811A64D5842EF3F8D1`
- Channel implementation v3 address (Polygon): `0x6b423D3885B4877b5760E149364f85f185f477aD`
- Channel implementation address (Ethereum): `0xBd20839B331A7A8d10e34CDf7219edf334814c4f`

## Testnet3 deployment (ethereum Görli and polygon Mumbai testnets)

MYSTT test token:
- on Görli: [0xf74a5ca65E4552CfF0f13b116113cCb493c580C5](https://goerli.etherscan.io/address/0xf74a5ca65E4552CfF0f13b116113cCb493c580C5)
- on Mumbai: [0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8](https://explorer-mumbai.maticvigil.com/tokens/0xB923b52b60E247E34f9afE6B3fa5aCcBAea829E8/token-transfers)

Registry smart contract:
- Görli: [0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39](https://goerli.etherscan.io/address/0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39)
- Mumbai: [0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39](https://explorer-mumbai.maticvigil.com/address/0xDFAB03C9fbDbef66dA105B88776B35bfd7743D39/transactions)

Hermes smart contract:
- Görli [0x7119442C7E627438deb0ec59291e31378F88DD06](https://goerli.etherscan.io/address/0x7119442C7E627438deb0ec59291e31378F88DD06)
- Mumbai [0x7119442C7E627438deb0ec59291e31378F88DD06](https://explorer-mumbai.maticvigil.com/address/0x7119442C7E627438deb0ec59291e31378F88DD06/transactions)

Implementation addresses:
- Hermes implementation address (same on both networks): `0x72227c86B8B6C0cA292C3631679a5DdB20433cb3`
- Channel implementation address (Görli): `0x1aDF7Ef34b9d48DCc8EBC47D989bfdE55933B6ea`
- Channel implementation address (Mumbai): `0xf8982Ba93D3d9182D095B892DE2A7963eF9807ee`


## Building golang bindings

To be able easily call these smart contract out of any software writen in Go you need to generate golang bindings and import [`payments`](https://github.com/mysteriumnetwork/payments) package into your software.

1. Tag newest version of smart contracts on GitHub
2. CI will build artifacts
3. Go to [`payments`](https://github.com/mysteriumnetwork/payments) repo and in `go.gen` set tag and which artifacts to build.
4. Run `mage generate`.
