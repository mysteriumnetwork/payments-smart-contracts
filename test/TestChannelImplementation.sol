pragma solidity ^0.5.0;

import { ChannelImplementation } from "../contracts/ChannelImplementation.sol";

// Helper functions to be used in tests
contract TestChannelImplementation is ChannelImplementation {

    constructor (address _token, address _DEXImplementation, address _DEXOwner, uint256 _rate) public ChannelImplementation(_token, _DEXImplementation, _DEXOwner, _rate) {
    }
    
    function getNow() public view returns (uint256) {
        return now;
    }
}
