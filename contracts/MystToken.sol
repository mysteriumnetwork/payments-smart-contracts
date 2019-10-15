pragma solidity ^0.5.12;

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { ERC20 } from "openzeppelin-solidity/contracts/token/ERC20/ERC20.sol";
import { ERC20Mintable } from "openzeppelin-solidity/contracts/token/ERC20/ERC20Mintable.sol";


// Standard ERC20 token to represent MYST token in testnet and local environment.
contract MystToken is ERC20, ERC20Mintable, Ownable {
    string public constant name = "Test Myst token";
    string public constant symbol = "MYSTT";
    uint8 public constant decimals = 18;
}
