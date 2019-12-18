pragma solidity >=0.4.21 <0.6.0;

import "./Config.sol";

contract AccountantImplementationProxy {

    // At this address we're saving persistent state of our forwarder
    address constant configAddress = 0xBEbeBeBEbeBebeBeBEBEbebEBeBeBebeBeBebebe;

    // keccak256('accountant implementation')
    bytes32 constant IMPLEMENTATION = 0xe6906d4b6048dd18329c27945d05f766dd19b003dc60f82fd4037c490ee55be0;

    function () external payable {
        address _target = Config(configAddress).getAddress(IMPLEMENTATION);
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
