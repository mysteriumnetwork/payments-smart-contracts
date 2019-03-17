pragma solidity ^0.5.0;

import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";


contract FundsRecovery is Ownable {
    address payable internal fundsDestination;

    event DestinationChanged(address indexed previousDestination, address indexed newDestination);

    /**
     * Setting new destination of funds recovery.
     */
    function setFundsDestination(address payable _newDestination) public onlyOwner {
        require(_newDestination != address(0));
        emit DestinationChanged(fundsDestination, _newDestination);
        fundsDestination = _newDestination;
    }

    /**
     * Getting funds destination address.
     */
    function getFundsDestination() public view returns (address) {
        return fundsDestination;
    }

    /**
     * Possibility to recover funds in case they were sent to this address before smart contract deployment
     */
    function claimEthers() public {
        require(fundsDestination != address(0));
        fundsDestination.transfer(address(this).balance);
    }

    /**
       Transfers selected tokens into owner address.
    */
    function claimTokens(address token) public {
        require(fundsDestination != address(0));
        uint256 _amount = IERC20(token).balanceOf(address(this));
        IERC20(token).transfer(fundsDestination, _amount);
    }
}
