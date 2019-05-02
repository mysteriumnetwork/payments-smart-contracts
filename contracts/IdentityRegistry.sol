pragma solidity ^0.5.0;

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";
import { ChannelImplementation } from "./ChannelImplementation.sol";


contract IdentityRegistry is Ownable, FundsRecovery {
    using SafeMath for uint256;

    string constant REGISTER_PREFIX="Register prefix:";
    IERC20 public token;
    address public dex;
    uint256 public registrationFee;
    address channelImplementation;
    
    event Registered(address indexed identityHash);

    constructor (address _tokenAddress, address _dexAddress, uint256 _regFee, address _implementation) public {
        registrationFee = _regFee;

        require(_tokenAddress != address(0));
        token = IERC20(_tokenAddress);

        require(_dexAddress != address(0));
        dex = _dexAddress;

        require(_implementation != address(0));
        channelImplementation = _implementation;
    }

    // Reject any ethers send to this smart-contract
    function () external payable {
        revert("Rejecting tx with ethers sent");
    }

    function registerIdentity(address _identityHash, address _hubId) public {
        require(_identityHash != address(0));
        require(!isRegistered(_identityHash));

        if (registrationFee > 0) {
            token.transferFrom(msg.sender, address(this), registrationFee);
        }

        // Deploy channel contract for given identity (mini proxy which is pointing to implementation)
        ChannelImplementation _channel = ChannelImplementation(deployMiniProxy(uint256(_identityHash)));
        _channel.initialize(address(token), dex, _identityHash, _hubId);

        emit Registered(_identityHash);
    }

    function deployMiniProxy(uint256 _salt) internal returns (address payable) {
        address payable _addr; 
        bytes memory _code = getProxyCode();

        assembly {
            _addr := create2(0, add(_code, 0x20), mload(_code), _salt)
            if iszero(extcodesize(_addr)) {
                revert(0, 0)
            }
        }

        return _addr;
    }

    // NOTE: in final implementation this function will return static code (with `channelImplementation` address hardcoded there).
    // We're using this way now for easier testing.
    function getProxyCode() public view returns (bytes memory) {
        // `_code` is EIP 1167 - Minimal Proxy Contract
        // more information: https://eips.ethereum.org/EIPS/eip-1167
        bytes memory _code = hex"3d602d80600a3d3981f3363d3d373d3d3d363d73bebebebebebebebebebebebebebebebebebebebe5af43d82803e903d91602b57fd5bf3";

        bytes20 _targetBytes = bytes20(channelImplementation);
        for (uint8 i = 0; i < 20; i++) {
            _code[20 + i] = _targetBytes[i];
        }

        return _code;
    }

    function getChannelAddress(address _identityHash) public view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            bytes32(uint256(_identityHash)),
            bytes32(keccak256(getProxyCode()))
        ))));
    }

    function isRegistered(address _identityHash) public view returns (bool) {
        address _addr = getChannelAddress(_identityHash);
        uint _codeLength;

        assembly {
            _codeLength := extcodesize(_addr)
        }

        return _codeLength != 0;
    }

    function changeRegistrationFee(uint256 _newFee) public onlyOwner {
        registrationFee = _newFee;
    }

    function transferCollectedFeeTo(address _beneficiary) public onlyOwner{
        uint256 _collectedFee = token.balanceOf(address(this));
        require(_collectedFee > 0);
        token.transfer(_beneficiary, _collectedFee);
    }
}
