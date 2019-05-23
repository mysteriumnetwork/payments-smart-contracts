pragma solidity ^0.5.8;

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";


contract MystDEX is Ownable, FundsRecovery {
    using SafeMath for uint256;

    bool public initialised;
    uint256 rate;   // Wei per token
    IERC20 token;
    
    // Default function - converts ethers to MYST
    function () external payable {
        require(initialised, "Contract is not initialised");

        uint256 tokensAmount = msg.value.div(rate).mul(1e18);

        require(token.balanceOf(address(this)) >= tokensAmount);
        token.transfer(msg.sender, tokensAmount);
    }

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialise(address _dexOwner, address _token, uint256 _rate) public {
        require(!initialised, "Contract is already initialised");
        _transferOwnership(_dexOwner);
        token = IERC20(_token);
        rate = _rate;
        initialised = true;
    }

    function setRate (uint256 _newRate) public onlyOwner {
        rate = _newRate;
    }

    // Transfers selected tokens into tokens destination address.
    function transferEthers(address payable _to, uint256 _amount) external onlyOwner {
        require(address(this).balance >= _amount);
        _to.transfer(_amount);
    }

    function transferMyst(address _to, uint256 _amount) external onlyOwner {
        require(token.balanceOf(address(this)) >= _amount);
        token.transfer(_to, _amount);
    }
}
