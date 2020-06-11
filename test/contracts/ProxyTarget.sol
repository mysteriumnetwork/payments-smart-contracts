// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0 <0.7.0;

contract ProxyTargetBase {
    bool public initialised;

    function initialise() public {
        require(!initialised);
        initialised = true;
    }
}

contract ProxyTarget is ProxyTargetBase {
    constructor() public {
        initialise();
    }

    function name() external pure returns (string memory) {
        string memory _name = "FirstTarget";
        return _name;
    }
}

contract SecondProxyTarget is ProxyTargetBase {
    function name() external pure returns (string memory) {
        string memory _name = "SecondTarget";
        return _name;
    }
}
