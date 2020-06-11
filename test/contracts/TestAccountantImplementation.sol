// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

import { AccountantImplementation } from "../../contracts/AccountantImplementation.sol";


// Helper functions to be used in tests
contract TestAccountantImplementation is AccountantImplementation {
    uint256 constant TEST_DELAY_BLOCKS = 4;

    function initialize(address _token, address _operator, uint16 _fee, uint256 _maxStake) public {
        super.initialize(_token, _operator, _fee, _maxStake);
        minStake = 25;
    }

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
        return now;
    }

    function getLockedFunds() public view returns (uint256) {
        return lockedFunds;
    }

    function getTotalStake() public view returns (uint256) {
        return totalStake;
    }

    uint256 internal jumps;
    function moveBlock() public {
        jumps = jumps + 1;
    }
}
