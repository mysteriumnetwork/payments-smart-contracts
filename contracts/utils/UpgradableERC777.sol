// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts/introspection/ERC1820Implementer.sol";
import { IUpgradeAgent } from "../interfaces/IUpgradeAgent.sol";
import { ERC1820Client } from "./ERC1820Client.sol";

/**
 * Token migration
 *
 * This mechanism allows futher token migration if such will be needed.
 */
contract UpgradableERC777 is ERC777, IERC777Recipient, ERC1820Implementer, ERC1820Client {
    address public upgradeMaster;
    IUpgradeAgent public upgradeAgent;                       // The next contract where the tokens will be migrated.
    uint256 public totalUpgraded;                           // How many tokens we have upgraded by now.

    enum UpgradeState {Unknown, NotAllowed, WaitingForAgent, ReadyToUpgrade, Upgrading}

    event Upgrade(address indexed from, address indexed to, address upgradeAgent, uint256 _value);
    event UpgradeAgentSet(address agent);

    constructor(string memory _name, string memory _symbol, address[] memory _defaultOperators)
        ERC777(_name, _symbol, _defaultOperators)
        public
    {
        setInterfaceImplementation("ERC777TokensRecipient", address(this));
        upgradeMaster = msg.sender;
    }

    function _upgrade(address _from, address _to, uint256 _amount, bytes memory data) internal {
        require(_amount > 0, "amount should be more than 0");

        // Burn tokens to be upgraded
        _burn(_from, _amount, data, "");

        // Remember how many tokens we have upgraded
        totalUpgraded = totalUpgraded.add(_amount);

        // Upgrade agent reissues the tokens
        upgradeAgent.upgradeFrom(_to, _amount);
        emit Upgrade(_from, _to, address(upgradeAgent), _amount);
    }

    function tokensReceived(address, address _from, address _to, uint256 _amount, bytes calldata _userData, bytes calldata) public override {
        UpgradeState state = getUpgradeState();
        require(state == UpgradeState.ReadyToUpgrade || state == UpgradeState.Upgrading, "receive not allowed");

        require(_to == address(this), "only works with tokens sent to this contract");
        require(msg.sender == address(this), "only working with own tokens");

        _upgrade(_to, _from, _amount, _userData);
    }

    function upgrade(uint256 _amount, bytes memory _data) public {
        UpgradeState state = getUpgradeState();
        if(!(state == UpgradeState.ReadyToUpgrade || state == UpgradeState.Upgrading)) {
            revert("called in a bad state");
        }

        _upgrade(msg.sender, msg.sender, _amount, _data);
    }

    function setUpgradeAgent(address _agent) external {
        require(msg.sender == upgradeMaster, "only a master can designate the next agent");
        require(_agent != address(0x0));
        require(getUpgradeState() != UpgradeState.Upgrading, "upgrade has already begun");

        upgradeAgent = IUpgradeAgent(_agent);

        // Bad interface
        if(!upgradeAgent.isUpgradeAgent()) revert();

        // Make sure that token supplies match in source and target
        if (upgradeAgent.originalSupply() != totalSupply()) revert();

        emit UpgradeAgentSet(address(upgradeAgent));
    }

    function getUpgradeState() public view returns(UpgradeState) {
        if(address(upgradeAgent) == address(0x00)) return UpgradeState.WaitingForAgent;
        else if(totalUpgraded == 0) return UpgradeState.ReadyToUpgrade;
        else return UpgradeState.Upgrading;
    }

    function setUpgradeMaster(address _newUpgradeMaster) public {
        require(_newUpgradeMaster != address(0x0), "upgrade master can't be zero address");
        require(msg.sender == upgradeMaster, "only upgrade master can set new one");
        upgradeMaster = _newUpgradeMaster;
    }
}
