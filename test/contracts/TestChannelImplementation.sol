// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import { ChannelImplementation } from "../../contracts/ChannelImplementation.sol";

// Helper functions to be used in tests
contract TestChannelImplementation is ChannelImplementation {
    uint256 constant TEST_DELAY_TIME = 3;

    // Constructor is needed only in tests where we don't use minimal Proxies and testing implementation directly
    constructor (address _token, address _dex, address _identityHash, address _hermesAddress, uint256 _fee) {
        initialize(_token, _dex, _identityHash, _hermesAddress, _fee);
    }

    function getTimelock() internal view override returns (uint256) {
        return block.timestamp + TEST_DELAY_TIME;
    }

    function getNow() public view returns (uint256) {
        return block.timestamp;
    }
}
