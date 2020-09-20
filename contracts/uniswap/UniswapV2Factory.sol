// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.1;

contract UniswapV2Factory {

    event PairCreated(address indexed token0, address indexed token1, address pair, uint);

    function createPair(address , address ) external returns (address) {
        return address(0x0);
    }

}