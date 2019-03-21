Main concepts
=============

Registry smart contract
-----------------------

`contracts/IdentityRegistry.sol` - will register new identity, get stake and will deploy dedicated for given identity smart contract.

Identity smart contract
-----------------------

Each user will have own smart contract with deterministically (thanks to CREATE2 opcode) derived address. In this smart-contracts `registry` will deploy mini proxies (EIP 1167) which should point into `IdentityImplementation` smart contact.

`contracts/IdentityImplementation.sol` - is implementation of identity smart contracts. It have to be deployed once and can be reused many times by `proxies`.