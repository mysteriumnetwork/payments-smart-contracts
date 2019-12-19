pragma solidity >=0.5.12 <0.6.0;

import "./Config.sol";

contract ChannelImplementationProxy {
    address constant CONFIG_ADDRESS = 0xF8B0E425AB9BE026B67a6429F0C8E3394983EdA8;

    function () external payable {
        address _target = Config(CONFIG_ADDRESS).getAddress(0x48df65c92c1c0e8e19a219c69bfeb4cf7c1c123e0c266d555abb508d37c6d96e); // keccak256('channel implementation')
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize)
            let success := delegatecall(sub(gas, 10000), _target, ptr, calldatasize, 0, 0)
            let retSz := returndatasize
            returndatacopy(ptr, 0, retSz)

            switch success
            case 0 { revert(ptr, retSz) }
            default { return(ptr, retSz) }
        }
    }
}
