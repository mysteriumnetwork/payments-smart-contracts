pragma solidity ^0.5.0;

import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { DEXProxy } from "./DEXProxy.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface MystDEX {
    function initialise(address _dexOwner, address _token, uint256 _rate) external;
}

contract IdentityImplementation is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    IERC20 public token;  // NOTE: token can be actually constant or be received from external config
    address public identityHash;
    address public dex;

    string constant WITHDRAW_PREFIX = "Withdraw request:";
    string constant SETTLE_PREFIX = "Settlement request:";

    mapping(address => uint256) public paidAmounts;

    event Withdrawn(address indexed receiver, uint256 amount, uint256 totalBalance);
    event PromiseSettled(address indexed receiver, uint256 amount, uint256 totalSettled);

    constructor (address _token, address _DEXImplementation, address _DEXOwner, uint256 _rate) public {
        require(_token != address(0));
        require(_DEXImplementation != address(0));
        require(_DEXOwner != address(0));

        // Deploy MystDex proxy and set default target to `_DEXImplementation`
        dex = address(new DEXProxy(_DEXImplementation, _DEXOwner));
        MystDEX(dex).initialise(_DEXOwner, _token, _rate);
    }

    // Fallback function - redirect ethers topup into DEX
    function () external payable {
        (bool success, bytes memory data) = address(dex).call.value(msg.value)(msg.data);
        require(success, "Tx was rejected by DEX");
    }

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialize(address _token, address _identityHash) public {
        require(!isInitialized(), "Is already initialized");
        require(_identityHash != address(0));
        require(_token != address(0));

        token = IERC20(_token);
        identityHash = _identityHash;

        // TODO: add bounty on initialise for registration incentivisation
    }

    function isInitialized() public view returns (bool) {
        return identityHash != address(0);
    }

    // Settle promise. Withdrawal can be also be done using same function. 
    function settlePromise(address _to, uint256 _amount, uint256 _fee, bytes32 _extraDataHash, bytes memory _signature) public {
        uint256 _paidAmount = sendByCheque(_to, _amount, _fee, _extraDataHash, _signature);
        emit PromiseSettled(_to, _paidAmount, paidAmounts[_to]);
    }

    function withdraw(address _to, uint256 _amount, bytes memory _signature) public {
        bytes32 _extraDataHash = keccak256("");
        uint256 _paidAmount = sendByCheque(_to, _amount, 0, _extraDataHash, _signature);
        emit Withdrawn(_to, _paidAmount, token.balanceOf(address(this)));
    }

    function sendByCheque(address _to, uint256 _amount, uint256 _fee, bytes32 _extraDataHash, bytes memory _signature) internal returns (uint256) {
        require(_to != address(0));

        address _signer = keccak256(abi.encodePacked(SETTLE_PREFIX, _to, _amount, _fee, _extraDataHash)).recover(_signature);
        require(_signer == identityHash, "Have to be signed by proper identity");

        // Calculate amount of tokens to be claimed.
        uint256 _unpaidAmount = _amount.sub(paidAmounts[_to]);
        require(_unpaidAmount > 0, "Amount to settle is less that zero");

        // If signer has less tokens than asked to transfer, we can transfer as much as he has already
        // and rest tokens can be transferred via same cheque but in another tx 
        // when signer will top up his balance.
        if (_unpaidAmount > token.balanceOf(address(this))) {
            _unpaidAmount = token.balanceOf(address(this));
        }

        // Increase already paid amount
        uint256 _totalPaidAmount = paidAmounts[_to].add(_unpaidAmount);
        paidAmounts[_to] = _totalPaidAmount;

        // Send tokens
        token.transfer(_to, _unpaidAmount.sub(_fee));

        if (_fee > 0) {
            token.transfer(msg.sender, _fee);
        }

        return _unpaidAmount;
    }

    function getHash(address _to, uint256 _amount) public pure returns (bytes32) {
        uint256 _fee = 0;
        bytes32 _extraDataHash = "";
        return keccak256(abi.encodePacked(SETTLE_PREFIX, _to, _amount, _fee, _extraDataHash));
        // return abi.encodePacked(SETTLE_PREFIX, _to, _amount, _fee, _extraDataHash);
    }

}
