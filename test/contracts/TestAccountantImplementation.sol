pragma solidity ^0.5.7;

import { AccountantImplementation } from "../../contracts/AccountantImplementation.sol";


// Helper functions to be used in tests
contract TestAccountantImplementation is AccountantImplementation {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    // constructor (address _token, address _operator) public {
    //     initialize(_token, _operator);
    // }

    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }
    
    function getNow() public view returns (uint256) {
        return now;
    }
}