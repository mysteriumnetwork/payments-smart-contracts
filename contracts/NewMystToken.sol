// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";


contract NewMystToken is ERC777 {
    uint256 public originalSupply;
    address public originalToken;

    constructor(address _originalToken, uint256 _originalSupply, address[] memory _defaultOperators)
        ERC777("Test Mysterium token v2", "MYSTTv2", _defaultOperators)
        public
    {
        originalToken  = _originalToken;
        originalSupply = _originalSupply;
    }

    /**
     * Upgrade agent interface inspired by Lunyr.
     *
     * Upgrade agent transfers tokens to a new contract.
     * Upgrade agent itself can be the token contract, or just a middle man contract doing the heavy lifting.
     */
    function isUpgradeAgent() public pure returns (bool) {
        return true;
    }

    function upgradeFrom(address _account, uint256 _value) public {
        require(msg.sender == originalToken, "only original token can call upgradeFrom");

        // Value is multiplied by 0e10 as old token had decimals = 8?
        _mint(_account, _value.mul(10000000000), "", "");

        require(totalSupply() <= originalSupply.mul(10000000000), "can not mint more tokens than in original contract");
    }
}
