// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20Token } from "./interfaces/IERC20Token.sol";
import { FundsRecovery } from "./FundsRecovery.sol";
import { Ownable } from "./Ownable.sol";


contract MystDEX is Ownable, FundsRecovery {
    using SafeMath for uint256;

    bool public initialised;
    uint256 rate;   // Wei per token

    // Default function - converts ethers to MYST
    receive() external payable {
        require(initialised, "Contract is not initialised");

        uint256 tokensAmount = msg.value.div(rate).mul(1e18);

        require(token.balanceOf(address(this)) >= tokensAmount);
        token.transfer(msg.sender, tokensAmount);
    }

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialise(address _dexOwner, address _token, uint256 _rate) public {
        require(!initialised, "Contract is already initialised");
        transferOwnership(_dexOwner);
        token = IERC20Token(_token);
        rate = _rate;
        initialised = true;
    }

    function setRate (uint256 _newRate) public onlyOwner {
        rate = _newRate;
    }

    // Transfers selected tokens into tokens destination address.
    function transferEthers(address payable _to, uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount, "not enough ether balance");
        _to.transfer(_amount);
    }

    function transferMyst(address _to, uint256 _amount) external onlyOwner {
        require(token.balanceOf(address(this)) >= _amount,"not enough myst balance");
        token.transfer(_to, _amount);
    }
}
