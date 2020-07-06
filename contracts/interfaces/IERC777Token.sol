// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";

abstract contract IERC777Token is IERC777 {
    function upgrade(uint256 amount, bytes calldata userData) public virtual;
}
