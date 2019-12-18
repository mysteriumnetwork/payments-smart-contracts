pragma solidity >=0.5.12 <0.6.0;

/**
 * Safe unsigned safe math.
 *
 * https://blog.aragon.one/library-driven-development-in-solidity-2bebcaf88736#.750gwtwli
 *
 * Originally from https://raw.githubusercontent.com/AragonOne/zeppelin-solidity/master/contracts/SafeMathLib.sol
 *
 * Maintained here until merged to mainline zeppelin-solidity.
 *
 */
library SafeMathLib {

    function times(uint a, uint b) public pure returns (uint) {
        uint c = a * b;
        require(a == 0 || c / a == b, "SafeMath: multiplication overflow");
        return c;
    }

    function minus(uint a, uint b) public pure returns (uint) {
        require(b <= a, "SafeMath: subtraction overflow");
        return a - b;
    }

    function plus(uint a, uint b) public pure returns (uint) {
        uint c = a + b;
        require(c>=a && c>=b, "SafeMath: addition overflow");
        return c;
    }
}