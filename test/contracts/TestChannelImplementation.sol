pragma solidity ^0.5.8;

import { ChannelImplementation } from "../../contracts/ChannelImplementation.sol";
import { MystDEX } from "../../contracts/MystDEX.sol";


// Helper functions to be used in tests
contract TestChannelImplementation is ChannelImplementation {

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    constructor (address _token, address _identityHash, address _accountantAddress) public {
        MystDEX _dex = new MystDEX();
        initialize(_token, address(_dex), _identityHash, _accountantAddress);
    }
    
    function getNow() public view returns (uint256) {
        return now;
    }
}
