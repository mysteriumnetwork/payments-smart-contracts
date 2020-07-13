// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import { IUpgradeAgent } from "./interfaces/IUpgradeAgent.sol";
import "@openzeppelin/contracts/token/ERC777/ERC777.sol";

contract TestMystToken is ERC777, IUpgradeAgent {
    address public originalToken;
    address[] empty;

    constructor () ERC777("Test Mysterium token v2", "MYSTTv2", empty) public {}

    function initilize(address _originalToken, uint256 _originalSupply) public {
        originalToken  = _originalToken;
        originalSupply = _originalSupply;
    }

    /** Interface marker */
    function isUpgradeAgent() public override pure returns (bool) {
      return true;
    }

    function upgradeFrom(address _account, uint256 _amount) public override {
        require(msg.sender == originalToken, "only original token can call upgradeFrom");

        // Value is multiplied by 0e10 as old token had decimals = 8?
        _mint(_account, _amount, "", "");

        require(totalSupply() <= originalSupply, "can not mint more tokens than in original contract");
    }

    function mint(address _account, uint _amount) public {
        _mint(_account, _amount, "", "");
    }
}
