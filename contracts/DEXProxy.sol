// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;


contract DEXProxy {
    bytes32 constant IMPLEMENTATION_POSITION = keccak256("MysDEXProxy.implementation");
    bytes32 constant OWNER_POSITION = keccak256("MystDEXProxy.owner");

    event Upgraded(address indexed newImplementation);

    modifier _onlyProxyOwner() {
        require(msg.sender == ___proxyOwner(), "Only owner can run this function");
        _;
    }

    constructor (address _implementation, address _owner) public {
        require(_implementation != address(0x0));

        bytes32 _ownerPosition = OWNER_POSITION;
        bytes32 _implementationPosition = IMPLEMENTATION_POSITION;

        assembly {
            sstore(_ownerPosition, _owner)       // sets owner
            sstore(_implementationPosition, _implementation) // sets proxy target
        }
    }

    // Proxying all calls into MystDEX implementation
    receive() external payable {
        ___default();
    }

    fallback() external {
        ___default();
    }

    function ___default() internal {
        address _implementation = ___Implementation();
        assembly {
            let ptr := mload(0x40)
            calldatacopy(ptr, 0, calldatasize())
            let success := delegatecall(sub(gas(), 10000), _implementation, ptr, calldatasize(), 0, 0)
            let retSz := returndatasize()
            returndatacopy(ptr, 0, retSz)

            switch success
            case 0 { revert(ptr, retSz) }
            default { return(ptr, retSz) }
        }
    }

    function ___proxyOwner() public view returns (address owner) {
        bytes32 _position = OWNER_POSITION;
        assembly {
            owner := sload(_position)
        }
    }

    function ___setProxyOwner(address _newOwner) external _onlyProxyOwner {
        bytes32 position = OWNER_POSITION;
        assembly {
            sstore(position, _newOwner)
        }
    }

    function ___Implementation() public view returns (address _implementation) {
        bytes32 _position = IMPLEMENTATION_POSITION;
        assembly {
            _implementation := sload(_position)
        }
    }

    function ___upgradeTo(address _newImplementation) public _onlyProxyOwner {
        bytes32 position = IMPLEMENTATION_POSITION;
        assembly {
            sstore(position, _newImplementation)
        }
        emit Upgraded(_newImplementation);
    }

    function __upgradeToAndCall(address _newImplementation, bytes memory _data) public payable _onlyProxyOwner {
        ___upgradeTo(_newImplementation);
        (bool success, ) = address(this).call{value: msg.value}(_data);
        require(success, "Calling new target failed");
    }
}
