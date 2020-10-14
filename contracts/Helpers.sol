// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.1;

contract Helpers {
    function getChainID() internal pure returns (uint256) {
        uint256 chainID;
        assembly {
            chainID := chainid()
        }
        return chainID;
    }

    // Validate ...
}