pragma solidity ^0.5.7;

import { AccountantImplementation } from "../../contracts/AccountantImplementation.sol";


// Helper functions to be used in tests
contract TestAccountantImplementation is AccountantImplementation {
    uint256 constant DELAY_BLOCKS = 4;

    function initialize(address _token, address _operator, uint16 _fee, uint256 _maxStake) public {
        super.initialize(_token, _operator, _fee, _maxStake);
        minStake = 25;
    }

    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function getEmergencyTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function getUnitBlocks() internal pure returns (uint256) {
        return DELAY_BLOCKS;
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
