// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.1;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20Token } from "./interfaces/IERC20Token.sol";
import { IHermesContract } from "./interfaces/IHermesContract.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface Channel {
    function initialize(address _token, address _dex, address _identityHash, address _hermesId, uint256 _fee) external;
}

contract Registry is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    uint256 internal lastNonce;
    address payable public dex;  // Any uniswap v2 compatible DEX router address
    uint256 public minimalHermesStake;

    struct Implementation {
        address channelImplAddress;
        address hermesImplAddress;
    }
    Implementation[] internal implementations;

    struct Hermes {
        address operator;   // hermes operator who will sign promises
        uint256 implVer;    // version of hermes implementation smart contract
        function() external view returns(uint256) stake;
        bytes url;          // hermes service URL
    }
    mapping(address => Hermes) public hermeses;

    mapping(address => bool) private identities;

    event RegisteredIdentity(address indexed identityHash, address indexed hermesId);
    event RegisteredHermes(address indexed hermesId, address hermesOperator, bytes ur);
    event HermesURLUpdated(address indexed hermesId, bytes newURL);
    event ConsumerChannelCreated(address indexed identityHash, address indexed hermesId, address channelAddress);

    constructor (address _tokenAddress, address payable _dexAddress, uint256 _minimalHermesStake, address _channelImplementation, address _hermesImplementation) {
        minimalHermesStake = _minimalHermesStake;

        require(_tokenAddress != address(0));
        token = IERC20Token(_tokenAddress);

        require(_dexAddress != address(0)); // TODO add some check if this is actually RouterInterface DEX
        dex = _dexAddress;

        // Set initial channel implementations
        setImplementations(_channelImplementation, _hermesImplementation);

        // Contract deployer is initial owner
        transferOwnership(msg.sender);
    }

    // Reject any ethers sent to this smart-contract
    receive() external payable {
        revert("Registry: Rejecting tx with ethers sent");
    }

    // Register identity and open spending and incomming channels with given hermes
    // _stakeAmount - it's amount of tokens staked into hermes to guarantee incomming channel's balance.
    function registerIdentity(address _hermesId, uint256 _stakeAmount, uint256 _transactorFee, address _beneficiary, bytes memory _signature) public {
        require(isActiveHermes(_hermesId), "Registry: provided hermes have to be active");

        // Check if given signature is valid
        address _identityHash = keccak256(abi.encodePacked(address(this), _hermesId, _stakeAmount, _transactorFee, _beneficiary)).recover(_signature);
        require(_identityHash != address(0), "Registry: wrong identity signature");

        // Tokens amount to get from channel to cover tx fee and provider's stake
        uint256 _totalFee = _stakeAmount.add(_transactorFee);
        require(_totalFee <= token.balanceOf(getChannelAddress(_identityHash, _hermesId)), "Registry: not enought funds in channel to cover fees");

        // Deploy channel contract for given identity (mini proxy which is pointing to implementation)
        bytes32 _salt = keccak256(abi.encodePacked(_identityHash, _hermesId));
        bytes memory _code = getProxyCode(getChannelImplementation(hermeses[_hermesId].implVer));
        Channel _channel = Channel(deployMiniProxy(uint256(_salt), _code));
        _channel.initialize(address(token), dex, _identityHash, _hermesId, _totalFee);

        // Opening incoming (provider's) channel
        if (_stakeAmount > 0 && _beneficiary != address(0)) {
            require(token.approve(_hermesId, _stakeAmount), "Registry: hermes should get approval to transfer tokens");
            IHermesContract(_hermesId).openChannel(_identityHash, _beneficiary, _stakeAmount);
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

    function registerHermes(address _hermesOperator, uint256 _hermesStake, uint16 _hermesFee, uint256 _minChannelStake, uint256 _maxChannelStake, bytes memory _url) public {
        require(_hermesOperator != address(0), "Registry: hermes operator can't be zero address");
        require(_hermesStake >= minimalHermesStake, "Registry: hermes have to stake at least minimal stake amount");

        address _hermesId = getHermesAddress(_hermesOperator);
        require(!isHermes(_hermesId), "Registry: hermes already registered");

        // Deploy hermes contract (mini proxy which is pointing to implementation)
        IHermesContract _hermes = IHermesContract(deployMiniProxy(uint256(_hermesOperator), getProxyCode(getHermesImplementation())));

        // Transfer stake into hermes smart contract
        token.transferFrom(msg.sender, address(_hermes), _hermesStake);

        // Initialise hermes
        _hermes.initialize(address(token), _hermesOperator, _hermesFee, _minChannelStake, _maxChannelStake, dex);

        // Save info about newly created hermes
        hermeses[address(_hermes)] = Hermes(_hermesOperator, getLastImplVer(), _hermes.getStake, _url);

        emit RegisteredHermes(address(_hermes), _hermesOperator, _url);
    }

    function getChannelAddress(address _identity, address _hermesId) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getChannelImplementation(hermeses[_hermesId].implVer)));
        bytes32 _salt = keccak256(abi.encodePacked(_identity, _hermesId));
        return getCreate2Address(_salt, _code);
    }

    function getHermesAddress(address _hermesOperator) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getHermesImplementation()));
        return getCreate2Address(bytes32(uint256(_hermesOperator)), _code);
    }

    function getHermesAddress(address _hermesOperator, uint256 _implVer) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode(getHermesImplementation(_implVer)));
        return getCreate2Address(bytes32(uint256(_hermesOperator)), _code);
    }

    function getHermesURL(address _hermesId) public view returns (bytes memory) {
        return hermeses[_hermesId].url;
    }

    function updateHermesURL(address _hermesId, bytes memory _url, bytes memory _signature) public {
        require(isActiveHermes(_hermesId), "Registry: provided hermes has to be active");

        // Check if given signature is valid
        address _operator = keccak256(abi.encodePacked(address(this), _hermesId, _url, lastNonce++)).recover(_signature);
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

    // -------- UTILS TO WORK WITH CHANNEL AND HERMES IMPLEMENTATIONS ---------

    function getChannelImplementation() public view returns (address) {
        return implementations[getLastImplVer()].channelImplAddress;
    }

    function getChannelImplementation(uint256 _implVer) public view returns (address) {
        return implementations[_implVer].channelImplAddress;
    }

    function getHermesImplementation() public view returns (address) {
        return implementations[getLastImplVer()].hermesImplAddress;
    }

    function getHermesImplementation(uint256 _implVer) public view returns (address) {
        return implementations[_implVer].hermesImplAddress;
    }

    function setImplementations(address _newChannelImplAddress, address _newHermesImplAddress) public onlyOwner {
        require(isSmartContract(_newChannelImplAddress) && isSmartContract(_newHermesImplAddress), "Registry: implementations have to be smart contracts");
        implementations.push(Implementation(_newChannelImplAddress, _newHermesImplAddress));
    }

    // Version of latest hermes and channel implementations
    function getLastImplVer() public view returns (uint256) {
        return implementations.length-1;
    }

    // ------------------------------------------------------------------------

    function isSmartContract(address _addr) internal view returns (bool) {
        uint _codeLength;

        assembly {
            _codeLength := extcodesize(_addr)
        }

        return _codeLength != 0;
    }

    // This is root registry, always return false
    function hasParentRegistry(address) public pure returns (bool) {
        return false;
    }

    function isRegistered(address _identity) public view returns (bool) {
        return identities[_identity];
    }

    function isHermes(address _hermesId) public view returns (bool) {
        // To check if it actually properly created hermes address, we need to check if he has operator
        // and if with that operator we'll get proper hermes address which has code deployed there.
        address _hermesOperator = hermeses[_hermesId].operator;
        uint256 _implVer = hermeses[_hermesId].implVer;
        address _addr = getHermesAddress(_hermesOperator, _implVer);
        if (_addr != _hermesId)
            return false; // hermesId should be same as generated address

        return isSmartContract(_addr);
    }

    function isActiveHermes(address _hermesId) internal view returns (bool) {
        // First we have to ensure that given address is registered hermes and only then check its status
        require(isHermes(_hermesId), "Registry: hermes have to be registered");

        IHermesContract.Status status = IHermesContract(_hermesId).getStatus();
        return status == IHermesContract.Status.Active;
    }

    function transferCollectedFeeTo(address _beneficiary) public onlyOwner{
        uint256 _collectedFee = token.balanceOf(address(this));
        require(_collectedFee > 0, "collected fee cannot be less than zero");
        token.transfer(_beneficiary, _collectedFee);
    }
}
