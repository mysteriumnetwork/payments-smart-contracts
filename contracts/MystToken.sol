// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import { IUpgradeAgent } from "./interfaces/IUpgradeAgent.sol";
import { UpgradableERC777 } from "./utils/UpgradableERC777.sol";


contract MystToken is UpgradableERC777, IUpgradeAgent {
    address public originalToken;

    constructor(address _originalToken, uint256 _originalSupply, address[] memory _defaultOperators)
        UpgradableERC777("Test Mysterium token", "MYSTT", _defaultOperators)
        public
    {
        originalToken  = _originalToken;
        originalSupply = _originalSupply;
    }

    /** Interface marker */
    function isUpgradeAgent() public override pure returns (bool) {
      return true;
    }

    function upgradeFrom(address _account, uint256 _value) public override {
        require(msg.sender == originalToken, "only original token can call upgradeFrom");

        // Value is multiplied by 0e10 as old token had decimals = 8?
        _mint(_account, _value.mul(10000000000), "", "");

        require(totalSupply() <= originalSupply.mul(10000000000), "can not mint more tokens than in original contract");
    }
}
