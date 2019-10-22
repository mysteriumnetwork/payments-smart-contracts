pragma solidity ^0.5.7;

import { AccountantImplementation } from "../../contracts/AccountantImplementation.sol";


// Helper functions to be used in tests
contract TestAccountantImplementation is AccountantImplementation {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    constructor (address _token, address _operator, uint16 _fee, uint256 _maxLoan) public {
        initialize(_token, _operator, _fee, _maxLoan);
    }

    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }
    
    function getNow() public view returns (uint256) {
        return now;
    }

    function getLockedFunds() public view returns (uint256) {
        return lockedFunds;
    }

    function getTotalLoan() public view returns (uint256) {
        return totalLoan;
    }

    uint256 internal jumps;
    function moveBlock() public {
        jumps = jumps + 1;
    }
}
