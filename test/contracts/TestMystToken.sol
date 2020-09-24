// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestMystToken is ERC20 {

    constructor () ERC20("Test Mysterium token", "MYSTT") {}

    function mint(address _account, uint _amount) public {
        _mint(_account, _amount);
    }

}
