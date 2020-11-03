// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.4;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract IERC20Token is IERC20 {
    function upgrade(uint256 value) public virtual;
}
