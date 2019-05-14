pragma solidity ^0.5.8;

import { ChannelImplementation } from "../../contracts/ChannelImplementation.sol";
import { MystDEX } from "../../contracts/MystDEX.sol";


// Helper functions to be used in tests
contract TestChannelImplementation is ChannelImplementation {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    constructor (address _token, address _identityHash, address _accountantAddress) public {
        MystDEX _dex = new MystDEX();
        initialize(_token, address(_dex), _identityHash, _accountantAddress);
    }

    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function getNow() public view returns (uint256) {
        return now;
    }
}
