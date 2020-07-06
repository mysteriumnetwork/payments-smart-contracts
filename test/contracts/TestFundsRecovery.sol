// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

import { IERC20Token } from "../../contracts/interfaces/IERC20Token.sol";
import { FundsRecovery } from "../../contracts/FundsRecovery.sol";
import { ERC1820Client } from "../../contracts/utils/ERC1820Client.sol";

// Helper functions to be used in tests
contract TestFundsRecovery is FundsRecovery, ERC1820Client {
    uint256 constant DELAY_BLOCKS = 4;

    // Constructor is needed only in tests
    constructor (address _token) public {
        token = IERC20Token(_token);
        transferOwnership(msg.sender);
        setInterfaceImplementation("ERC777TokensRecipient", address(this));
    }

}
