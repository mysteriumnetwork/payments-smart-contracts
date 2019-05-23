pragma solidity ^0.5.7;

import { AccountantImplementation } from "../../contracts/AccountantImplementation.sol";


// Helper functions to be used in tests
contract TestAccountantImplementation is AccountantImplementation {

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    constructor (address _token, address _operator) public {
        initialize(_token, _operator);
    }

    function getNow() public view returns (uint256) {
        return now;
    }
}
