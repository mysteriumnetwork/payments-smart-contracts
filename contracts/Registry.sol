pragma solidity >=0.5.12 <0.6.0;

import { Ownable } from "openzeppelin-solidity/contracts/ownership/Ownable.sol";
import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { Config } from "./Config.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface Channel {
    function initialize(address _token, address _dex, address _identityHash, address _accountantId, uint256 _fee) external;
}

interface HermesContract {
    enum Status { Active, Paused, Punishment, Closed }
    function initialize(address _token, address _operator, uint16 _accountantFee, uint256 _maxLoan) external;
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend) external;
    function getStake() external view returns (uint256);
    function getStatus() external view returns (Status);
}

contract Registry is Ownable, FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant REGISTER_PREFIX="Register prefix:";

    address public dex;
    Config public config;
    uint256 public registrationFee;
    uint256 public minimalAccountantStake;

    struct Accountant {
        address operator;
        function() external view returns(uint256) stake;
    }
    mapping(address => Accountant) public accountants;

    mapping(address => bool) private identities;

    event RegisteredIdentity(address indexed identityHash, address indexed accountantId);
    event RegisteredAccountant(address indexed accountantId, address accountantOperator);
    event ConsumerChannelCreated(address indexed identityHash, address indexed accountantId, address channelAddress);

    constructor (address _tokenAddress, address _dexAddress, address _configAddress, uint256 _regFee, uint256 _minimalAccountantStake) public {
        registrationFee = _regFee;
        minimalAccountantStake = _minimalAccountantStake;

        require(_tokenAddress != address(0));
        token = IERC20(_tokenAddress);

        require(_dexAddress != address(0));
        dex = _dexAddress;

        require(_configAddress != address(0));
        config = Config(_configAddress);
    }

    // Reject any ethers send to this smart-contract
    function () external payable {
        revert("Rejecting tx with ethers sent");
    }

    // Register identity and open spending and incomming channels with given accountant
    // _stakeAmount - it's amount of tokens staked into hermes to guarantee incomming channel's balance.
    function registerIdentity(address _hermesId, uint256 _stakeAmount, uint256 _transactorFee, address _beneficiary, bytes memory _signature) public {
        require(isActiveAccountant(_hermesId), "provided hermes have to be active");

        // Check if given signature is valid
        address _identityHash = keccak256(abi.encodePacked(address(this), _hermesId, _stakeAmount, _transactorFee, _beneficiary)).recover(_signature);
        require(_identityHash != address(0), "wrong signature");

        // Tokens amount to get from channel to cover tx fee, registration fee and provider's stake
        uint256 _totalFee = registrationFee.add(_stakeAmount).add(_transactorFee);
        require(_totalFee <= token.balanceOf(getChannelAddress(_identityHash, _hermesId)), "not enought funds in channel to cover fees");

        // Deploy channel contract for given identity (mini proxy which is pointing to implementation)
        bytes32 _salt = keccak256(abi.encodePacked(_identityHash, _hermesId));
        bytes memory _code = getProxyCode(getChannelImplementation());
        Channel _channel = Channel(deployMiniProxy(uint256(_salt), _code));
        _channel.initialize(address(token), dex, _identityHash, _hermesId, _totalFee);

        // Opening incoming (provider's) channel
        if (_stakeAmount > 0 && _beneficiary != address(0)) {
            require(token.approve(_hermesId, _stakeAmount), "hermes should get approval to transfer tokens");
            HermesContract(_hermesId).openChannel(_identityHash, _beneficiary, _stakeAmount);
        }

        // Pay fee for transaction maker
        if (_transactorFee > 0) {
            token.transfer(msg.sender, _transactorFee);
        }

        emit ConsumerChannelCreated(_identityHash, _hermesId, address(_channel));

        // Mark identity as registered if this is first registration attempt / first channel opened
        if (!isRegistered(_identityHash)) {
            identities[_identityHash] = true;
            emit RegisteredIdentity(_identityHash, _hermesId);
        }
    }

    function registerAccountant(address _accountantOperator, uint256 _stakeAmount, uint16 _accountantFee, uint256 _maxLoan) public {
        require(_accountantOperator != address(0), "operator can't be zero address");
        require(_stakeAmount >= minimalAccountantStake, "accountant have to stake at least minimal stake amount");

        address _accountantId = getAccountantAddress(_accountantOperator);
        require(!isAccountant(_accountantId), "accountant already registered");

        // Deploy accountant contract (mini proxy which is pointing to implementation)
        HermesContract _accountant = HermesContract(deployMiniProxy(uint256(_accountantOperator), getProxyCode(getAccountantImplementation())));

        // Transfer stake into accountant smart contract
        token.transferFrom(msg.sender, address(_accountant), _stakeAmount);

        // Initialise accountant
        _accountant.initialize(address(token), _accountantOperator, _accountantFee, _maxLoan);

        // Save info about newly created accountant
        accountants[address(_accountant)] = Accountant(_accountantOperator, _accountant.getStake);

        emit RegisteredAccountant(address(_accountant), _accountantOperator);
    }

    function getChannelAddress(address _identity, address _hermesId) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getChannelImplementation()));
        bytes32 _salt = keccak256(abi.encodePacked(_identity, _hermesId));
        return getCreate2Address(_salt, _code);
    }

    function getAccountantAddress(address _accountantOperator) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getAccountantImplementation()));
        return getCreate2Address(bytes32(uint256(_accountantOperator)), _code);
    }

    // ------------ UTILS ------------
    function getCreate2Address(bytes32 _salt, bytes32 _code) internal view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            bytes32(_salt),
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

    function deployMiniProxy(uint256 _salt, bytes memory _code) internal returns (address payable) {
        address payable _addr;

        assembly {
            _addr := create2(0, add(_code, 0x20), mload(_code), _salt)
            if iszero(extcodesize(_addr)) {
                revert(0, 0)
            }
        }

        return _addr;
    }

    bytes32 constant CHANNEL_IMPLEMENTATION = 0x2ef7e7c50e1b6a574193d0d32b7c0456cf12390a0872cf00be4797e71c3756f7;  // keccak256('channel implementation proxy')
    function getChannelImplementation() public view returns (address) {
        return config.getAddress(CHANNEL_IMPLEMENTATION);
    }

    bytes32 constant ACCOUNTANT_IMPLEMENTATION = 0x52948fa93a94851571e57fddc2be83c51e0a64bb5e9ca55f4f90439b9802b575;  // keccak256('accountant implementation proxy')
    function getAccountantImplementation() public view returns (address) {
        return config.getAddress(ACCOUNTANT_IMPLEMENTATION);
    }

    // ------------------------------------------------------------------------

    function isRegistered(address _identityHash) public view returns (bool) {
        return identities[_identityHash];
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

    function isActiveAccountant(address _accountantId) internal view returns (bool) {
        // If stake is 0, then it's either incactive or unregistered accountant
        HermesContract.Status status = HermesContract(_accountantId).getStatus();
        return status == HermesContract.Status.Active;
    }

    function changeRegistrationFee(uint256 _newFee) public onlyOwner {
        registrationFee = _newFee;
    }

    function transferCollectedFeeTo(address _beneficiary) public onlyOwner{
        uint256 _collectedFee = token.balanceOf(address(this));
        require(_collectedFee > 0, "collected fee cannot be less than zero");
        token.transfer(_beneficiary, _collectedFee);
    }
}
