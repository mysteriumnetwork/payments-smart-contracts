// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import { HermesImplementation } from "../../contracts/HermesImplementation.sol";


// Helper functions to be used in tests
contract TestHermesImplementation is HermesImplementation {
    uint256 constant TEST_DELAY_BLOCKS = 4;

    function getTimelock() internal view override returns (uint256) {
        return block.number + TEST_DELAY_BLOCKS;
    }

    function getEmergencyTimelock() internal view override returns (uint256) {
        return block.number + TEST_DELAY_BLOCKS;
    }

    function getUnitBlocks() internal pure override returns (uint256) {
        return TEST_DELAY_BLOCKS;
    }

    function getNow() public view returns (uint256) {
        return block.timestamp;
    }

    function getTotalStake() public view returns (uint256) {
        return totalStake;
    }

    uint256 internal jumps;
    function moveBlock() public {
        jumps = jumps + 1;
    }
}
