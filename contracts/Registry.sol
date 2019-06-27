pragma solidity ^0.5.8;

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface Channel {
    function initialize(address _token, address _dex, address _identityHash, address _accountantId, uint256 _fee) external;
}

interface AccountantContract {
    function initialize(address _token, address _operator) external;
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend, bytes calldata _signature) external;
}

contract Registry is Ownable, FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant REGISTER_PREFIX="Register prefix:";
    address public dex;
    uint256 public registrationFee;
    uint256 public minimalAccountantStake;
    uint256 public totalStaked;
    address internal channelImplementation;
    address public accountantImplementation;

    struct Accountant {
        address operator;
        uint256 stake;
    }
    mapping(address => Accountant) public accountants;

    event RegisteredIdentity(address indexed identityHash);
    event RegisteredAccountant(address accountantId, address accountantOperator);

    constructor (address _tokenAddress, address _dexAddress, address _channelImplementation, address _accountantImplementation, uint256 _regFee, uint256 _minimalAccountantStake) public {
        registrationFee = _regFee;
        minimalAccountantStake = _minimalAccountantStake;

        require(_tokenAddress != address(0));
        token = IERC20(_tokenAddress);

        require(_dexAddress != address(0));
        dex = _dexAddress;

        require(_channelImplementation != address(0));
        channelImplementation = _channelImplementation;

        require(_accountantImplementation != address(0));
        accountantImplementation = _accountantImplementation;
    }

    // Reject any ethers send to this smart-contract
    function () external payable {
        revert("Rejecting tx with ethers sent");
    }

    // Register identity and open spending and incomming channels with given accountant
    // _loanAmount - it's amount of tokens lended to accountant to guarantee incomming channel's balance.
    function registerIdentity(address _accountantId, uint256 _loanAmount, uint256 _fee, address _beneficiary, bytes memory _signature) public {
        require(isActiveAccountant(_accountantId), "provided accountant have to be active");

        // Check if given signature is valid
        address _identityHash = keccak256(abi.encodePacked(address(this), _accountantId, _loanAmount, _fee, _beneficiary)).recover(_signature);
        require(_identityHash != address(0));
        require(!isRegistered(_identityHash), "identityHash have to be not registered yet");

        // Tokens amount to get from channel to cover tx fee, registration fee and stake
        uint256 _totalFee = registrationFee.add(_loanAmount).add(_fee);
        require(_totalFee <= token.balanceOf(getChannelAddress(_identityHash)));

        // Deploy channel contract for given identity (mini proxy which is pointing to implementation)
        Channel _channel = Channel(deployMiniProxy(uint256(_identityHash), channelImplementation));
        _channel.initialize(address(token), dex, _identityHash, _accountantId, _totalFee);

        // If stake stake amount > 0, then opening incomming (provider's) channel
        if (_loanAmount > 0) {
            require(_beneficiary != address(0), "beneficiary can't be zero address");
            require(token.approve(_accountantId, _loanAmount), "accountant should get approval to transfer tokens");
            AccountantContract(_accountantId).openChannel(_identityHash, _beneficiary, _loanAmount, "");
        }

        // Pay fee for transaction maker
        if (_fee > 0) {
            token.transfer(msg.sender, _fee);
        }

        emit RegisteredIdentity(_identityHash);
    }

    function registerAccountant(address _accountantOperator, uint256 _stakeAmount) public {
        require(_accountantOperator != address(0));
        require(_stakeAmount >= minimalAccountantStake, "accountant have to stake at least minimal stake amount");

        address _accountantId = getAccountantAddress(_accountantOperator);
        require(!isAccountant(_accountantId));

        token.transferFrom(msg.sender, address(this), _stakeAmount);
        totalStaked = totalStaked.add(_stakeAmount);

        // Deploy accountant contract (mini proxy which is pointing to implementation)
        AccountantContract _accountant = AccountantContract(deployMiniProxy(uint256(_accountantOperator), accountantImplementation));
        _accountant.initialize(address(token), _accountantOperator);

        accountants[address(_accountant)] = Accountant(_accountantOperator, _stakeAmount);

        emit RegisteredAccountant(address(_accountant), _accountantOperator);
    }

    function getChannelAddress(address _identityHash) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(channelImplementation));
        return getCreate2Address(uint256(_identityHash), _code);
    }

    function getAccountantAddress(address _accountantOperator) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(accountantImplementation));
        return getCreate2Address(uint256(_accountantOperator), _code);
    }

    // ------------ UTILS ------------
    function getCreate2Address(uint256 _salt, bytes32 _code) internal view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            bytes32(uint256(_salt)),
            bytes32(_code)
        ))));
    }

    // NOTE: in final implementation this function will return static code (with `channelImplementation` address hardcoded there).
    // We're using this way now for easier testing.
    function getProxyCode(address _implementation) public pure returns (bytes memory) {
        // `_code` is EIP 1167 - Minimal Proxy Contract
        // more information: https://eips.ethereum.org/EIPS/eip-1167
        bytes memory _code = hex"3d602d80600a3d3981f3363d3d373d3d3d363d73bebebebebebebebebebebebebebebebebebebebe5af43d82803e903d91602b57fd5bf3";

        bytes20 _targetBytes = bytes20(_implementation);
        for (uint8 i = 0; i < 20; i++) {
            _code[20 + i] = _targetBytes[i];
        }

        return _code;
    }

    function deployMiniProxy(uint256 _salt, address _implementation) internal returns (address payable) {
        address payable _addr; 
        bytes memory _code = getProxyCode(_implementation);

        assembly {
            _addr := create2(0, add(_code, 0x20), mload(_code), _salt)
            if iszero(extcodesize(_addr)) {
                revert(0, 0)
            }
        }

        return _addr;
    }
    // ------------------------------------------------------------------------

    function isRegistered(address _identityHash) public view returns (bool) {
        address _addr = getChannelAddress(_identityHash);
        uint _codeLength;

        assembly {
            _codeLength := extcodesize(_addr)
        }

        return _codeLength != 0;
    }

    function isAccountant(address _accountantId) public view returns (bool) {
        address accountantOperator = accountants[_accountantId].operator;
        address _addr = getAccountantAddress(accountantOperator);
        uint _codeLength;

        assembly {
            _codeLength := extcodesize(_addr)
        }

        return _codeLength != 0;
    }

    function isActiveAccountant(address _accountantId) public view returns (bool) {
        // If stake is 0, then it's either incactive or unregistered accountant
        return accountants[_accountantId].stake != uint256(0);
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
