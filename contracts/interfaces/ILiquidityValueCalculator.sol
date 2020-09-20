// SPDX-License-Identifier: GPL-3.0
pragma solidity =0.7.1;

interface ILiquidityValueCalculator {
    function computeLiquidityShareValue(uint liquidity, address tokenA, address tokenB) external returns (uint tokenAAmount, uint tokenBAmount);
}
