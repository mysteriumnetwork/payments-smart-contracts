// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.5.12 <0.7.0;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface Channel {
    function initialize(address _token, address _dex, address _identityHash, address _hermesId, uint256 _fee) external;
}

interface HermesContract {
    enum Status { Active, Paused, Punishment, Closed }
    function initialize(address _token, address _operator, uint16 _hermesFee, uint256 _minStake, uint256 _maxStake) external;
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend) external;
    function getStake() external view returns (uint256);
    function getStatus() external view returns (Status);
}

interface ParentRegistry {
    function isRegistered(address _identityHash) external view returns (bool);
    function isAccountant(address _hermesId) external view returns (bool);
    function isActiveAccountant(address _hermesId) external view returns (bool);
}

contract Registry is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    address public dex;
    uint256 public registrationFee;
    uint256 public minimalHermesStake;
    address internal channelImplementationAddress;
    address internal hermesImplementationAddress;
    ParentRegistry internal parentRegistry;

    struct Hermes {
        address operator;   // hermes operator who will sign promises
        function() external view returns(uint256) stake;
        bytes url;          // hermes service URL
    }
    mapping(address => Hermes) public hermeses;

    mapping(address => bool) private identities;

    event RegisteredIdentity(address indexed identityHash, address indexed hermesId);
    event RegisteredHermes(address indexed hermesId, address hermesOperator, bytes ur);
    event HermesURLUpdated(address indexed hermesId, bytes newURL);
    event ConsumerChannelCreated(address indexed identityHash, address indexed hermesId, address channelAddress);

    constructor (address _tokenAddress, address _dexAddress, uint256 _regFee, uint256 _minimalHermesStake, address _channelImplementation, address _hermesImplementation, address _parentAddress) public {
        registrationFee = _regFee;
        minimalHermesStake = _minimalHermesStake;

        require(_tokenAddress != address(0));
        token = IERC20(_tokenAddress);

        require(_dexAddress != address(0));
        dex = _dexAddress;

        channelImplementationAddress = _channelImplementation;
        hermesImplementationAddress = _hermesImplementation;

        parentRegistry = ParentRegistry(_parentAddress);
    }

    // Reject any ethers sent to this smart-contract
    receive() external payable {
        revert("Rejecting tx with ethers sent");
    }

    // Register identity and open spending and incomming channels with given hermes
    // _stakeAmount - it's amount of tokens staked into hermes to guarantee incomming channel's balance.
    function registerIdentity(address _hermesId, uint256 _stakeAmount, uint256 _transactorFee, address _beneficiary, bytes memory _signature) public {
        require(isActiveHermes(_hermesId), "provided has have to be active");

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

    function registerHermes(address _hermesOperator, uint256 _stakeAmount, uint16 _hermesFee, uint256 _minStake, uint256 _maxStake, bytes memory _url) public {
        require(_hermesOperator != address(0), "operator can't be zero address");
        require(_stakeAmount >= minimalHermesStake, "hermes have to stake at least minimal stake amount");

        address _hermesId = getHermesAddress(_hermesOperator);
        require(!isHermes(_hermesId), "hermes already registered");

        // Deploy hermes contract (mini proxy which is pointing to implementation)
        HermesContract _hermes = HermesContract(deployMiniProxy(uint256(_hermesOperator), getProxyCode(getHermesImplementation())));

        // Transfer stake into hermes smart contract
        token.transferFrom(msg.sender, address(_hermes), _stakeAmount);

        // Initialise hermes
        _hermes.initialize(address(token), _hermesOperator, _hermesFee, _minStake, _maxStake);

        // Save info about newly created hermes
        hermeses[address(_hermes)] = Hermes(_hermesOperator, _hermes.getStake, _url);

        emit RegisteredHermes(address(_hermes), _hermesOperator, _url);
    }

    function getChannelAddress(address _identity, address _hermesId) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getChannelImplementation()));
        bytes32 _salt = keccak256(abi.encodePacked(_identity, _hermesId));
        return getCreate2Address(_salt, _code);
    }

    function getHermesAddress(address _hermesOperator) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getHermesImplementation()));
        return getCreate2Address(bytes32(uint256(_hermesOperator)), _code);
    }

    function getHermesURL(address _hermesId) public view returns (bytes memory) {
        return hermeses[_hermesId].url;
    }

    function updateHermsURL(address _hermesId, bytes memory _url, bytes memory _signature) public {
        require(isActiveHermes(_hermesId), "provided hermes has to be active");

        // Check if given signature is valid
        address _operator = keccak256(abi.encodePacked(address(this), _hermesId, _url)).recover(_signature);
        require(_operator == hermeses[_hermesId].operator, "wrong signature");

        // Update URL
        hermeses[_hermesId].url = _url;

        emit HermesURLUpdated(_hermesId, _url);
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

    function getChannelImplementation() public view returns (address) {
        return channelImplementationAddress;
    }

    function getHermesImplementation() public view returns (address) {
        return hermesImplementationAddress;
    }

    // ------------------------------------------------------------------------

    // Returns true when parent registry is set
    function hasParentRegistry(address _parentAddress) public view returns (bool) {
        return _parentAddress != address(0x0);
    }

    function isRegistered(address _identity) public view returns (bool) {
        if (hasParentRegistry(address(parentRegistry)) && parentRegistry.isRegistered(_identity)) {
            return true;
        }

        return identities[_identity];
    }

    function isHermes(address _hermesId) public view returns (bool) {
        if (hasParentRegistry(address(parentRegistry)) && parentRegistry.isAccountant(_hermesId)) {
            return true;
        }

        address hermesOperator = hermeses[_hermesId].operator;
        address _addr = getHermesAddress(hermesOperator);
        uint _codeLength;

        assembly {
            _codeLength := extcodesize(_addr)
        }

        return _codeLength != 0;
    }

    function isActiveHermes(address _hermesId) internal view returns (bool) {
        if (hasParentRegistry(address(parentRegistry)) && parentRegistry.isActiveAccountant(_hermesId)) {
            return true;
        }

        // If stake is 0, then it's either incactive or unregistered hermes
        HermesContract.Status status = HermesContract(_hermesId).getStatus();
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
