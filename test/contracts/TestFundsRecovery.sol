// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import { IERC20Token } from "../../contracts/interfaces/IERC20Token.sol";
import { FundsRecovery } from "../../contracts/FundsRecovery.sol";

// Helper functions to be used in tests
contract TestFundsRecovery is FundsRecovery {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests
    constructor (address _token) {
        token = IERC20Token(_token);
        transferOwnership(msg.sender);
    }

}
