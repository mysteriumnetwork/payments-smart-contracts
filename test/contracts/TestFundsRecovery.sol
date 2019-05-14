pragma solidity ^0.5.8;

import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "../../contracts/FundsRecovery.sol";

// Helper functions to be used in tests
contract TestFundsRecovery is FundsRecovery {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests
    constructor (address _token) public {
        token = IERC20(_token);
    }

}
