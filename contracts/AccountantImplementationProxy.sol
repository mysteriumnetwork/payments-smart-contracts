pragma solidity >=0.5.12 <0.6.0;

import "./Config.sol";

contract AccountantImplementationProxy {
    address constant CONFIG_ADDRESS = 0xa56A3e78757FFD0038d78065e2514786A055a8eB;

    function () external payable {
        address _target = Config(CONFIG_ADDRESS).getAddress(0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0);
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
