// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IERC20Token } from "../../contracts/interfaces/IERC20Token.sol";
import { FundsRecovery } from "../../contracts/FundsRecovery.sol";

interface AccountantContract {
    enum Status { Active, Paused, Punishment, Closed }
    function initialize(address _token, address _operator, uint16 _hermesFee, uint256 _minStake, uint256 _maxStake) external;
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend) external;
    function getStake() external view returns (uint256);
    function getStatus() external view returns (Status);
}

contract TestOldRegistry is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant REGISTER_PREFIX="Register prefix:";

    struct Accountant {
        address operator;
    }
    mapping(address => Accountant) public accountants;
    mapping(address => bool) private identities;

    event RegisteredIdentity(address indexed identityHash, address indexed accId);
    event RegisteredAccountant(address indexed accId, address accountantOperator);

    constructor (address _tokenAddress) {
        require(_tokenAddress != address(0));
        token = IERC20Token(_tokenAddress);
    }

    // Reject any ethers sent to this smart-contract
    receive() external payable {
        revert("Rejecting tx with ethers sent");
    }

    function registerIdentity(address _accId, uint256 _stakeAmount, uint256 _transactorFee, address _beneficiary, bytes memory _signature) public {
        // Check if given signature is valid
        address _identityHash = keccak256(abi.encodePacked(address(this), _accId, _stakeAmount, _transactorFee, _beneficiary)).recover(_signature);
        require(_identityHash != address(0), "wrong signature");

        if (!isRegistered(_identityHash)) {
            identities[_identityHash] = true;
            emit RegisteredIdentity(_identityHash, _accId);
        }
    }

    function registerAccountant(address _accountantOperator) public {
        address _accId = getAccountantAddress(_accountantOperator);
        require(!isAccountant(_accId), "accountant already registered");

        accountants[_accId] = Accountant(_accountantOperator);

        emit RegisteredAccountant(_accId, _accountantOperator);
    }

    function isRegistered(address _identity) public view returns (bool) {
        return identities[_identity];
    }

    function isAccountant(address _accId) public view returns (bool) {
        return accountants[_accId].operator != address(0);
    }

    function isActiveAccountant(address _accId) public view returns (bool) {
        AccountantContract.Status status = AccountantContract(_accId).getStatus();
        return status == AccountantContract.Status.Active;
    }

    function getAccountantAddress(address _accountantOperator) public view returns (address) {
        bytes32 _code = keccak256(getProxyCode());
        return getCreate2Address(bytes32(uint256(_accountantOperator)), _code);
    }

    function getCreate2Address(bytes32 _salt, bytes32 _code) internal view returns (address) {
        return address(uint256(keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            bytes32(_salt),
            bytes32(_code)
        ))));
    }

    function getProxyCode() public pure returns (bytes memory) {
        bytes memory _code = hex"3d602d80600a3d3981f3363d3d373d3d3d363d73bebebebebebebebebebebebebebebebebebebebe5af43d82803e903d91602b57fd5bf3";
        return _code;
    }
}
