pragma solidity ^0.5.0;

import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { DEXProxy } from "./DEXProxy.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface MystDEX {
    function initialise(address _dexOwner, address _token, uint256 _rate) external;
}

/*
    Ledger Channel between user and hub.
    This is channel implementation into which mini proxies will point to.
*/
contract ChannelImplementation is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant REBALANCE_PREFIX = "Rebalancing channel balances:";
    string constant EXIT_PREFIX = "Exit request:";

    event IdentityBalanceUpdated(uint256 balance);
    event ChannelStateUpdated(uint256 identityBalance, uint256 hubBalance, uint256 sequence);
    event FundsWithdrawn(address indexed party, address indexed beneficiary, uint256 amount);
    event ExitRequested(address party, uint256 timeout);

    struct Withdrawal {
        address party;
        address beneficiary;
        uint256 timeout;
    }

    IERC20 public token;             // NOTE: token can be actually constant or be received from external config
    address public dex;

    address public identityHash;     // sha3(identityPubKey)[:20]
    address public hubId;            // TODO get hubOperator here (from hubId contract)
    uint256 public identityBalance;
    uint256 public hubBalance;
    uint256 public lastSequence;
    uint256 public challengePeriod;  // Time in seconds
    Withdrawal public pendingWithdrawal; 

    // Only usefull in tests
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
    function initialize(address _token, address _dex, address _identityHash, address _hubId, uint256 _challengePeriod) public {
        require(!isInitialized(), "Is already initialized");
        require(_identityHash != address(0), "Identity can't be zero");
        require(_hubId != address(0), "HubID can't be zero");
        require(_token != address(0), "Token can't be deployd into zero address");

        token = IERC20(_token);
        dex = _dex;
        identityHash = _identityHash;
        hubId = _hubId;
        challengePeriod = _challengePeriod;

        updateIdentityBalance(); // in case there were token sent before contract deplyment
    }

    function isInitialized() public view returns (bool) {
        return identityHash != address(0);
    }

    // Topup via preliminary allowance. The only way to topup for hub.
    function deposit(address _party, uint256 _amount) public {
        updateIdentityBalance(); // First make sure that erlier topuped tokens already counted

        token.transferFrom(msg.sender, address(this), _amount);

        if (_party == hubId) {
            hubBalance = hubBalance.add(_amount);
        } else {
            identityBalance = identityBalance.add(_amount);
        }

        require(
            identityBalance.add(hubBalance) == token.balanceOf(address(this)),
            "sum balances must be equal to amount of locked tokens"
        );
    }

    // Will check if there was no tokens send into channel, and if founds some, add them into identity balance
    function updateIdentityBalance() public {
        identityBalance = token.balanceOf(address(this)).sub(hubBalance);
        emit IdentityBalanceUpdated(identityBalance);
    }

    // Alternative way to work with Identity balances TODO: add it in separate PR
    // function identityBalance() public view returns (uint256) {
    //     return token.balanceOf(address(this)).sub(hubBalance);
    // }

    // Update/rebalance channel
    function update(uint256 _identityBalance, uint256 _hubBalance, uint256 _sequence, bytes memory _identitySig, bytes memory _hubSig) public {
        require(_sequence > lastSequence, "provided sequence must be bigger than already seen");
        require(_identityBalance.add(_hubBalance) == token.balanceOf(address(this)), "sum of balances must be equal to amount of locked tokens");

        bytes32 _hash = keccak256(abi.encodePacked(REBALANCE_PREFIX, _identityBalance, _hubBalance, _sequence));

        address _recoveredIdentity = _hash.recover(_identitySig);
        require(_recoveredIdentity == identityHash, "wrong identity signature");

        address _recoveredHub = _hash.recover(_hubSig);
        require(_recoveredHub == hubId, "wrong hub signature");

        // Update channel state
        identityBalance = _identityBalance;
        hubBalance = _hubBalance;
        lastSequence = _sequence;

        emit ChannelStateUpdated(identityBalance, hubBalance, lastSequence);
    }

    // Fast withdraw request (with rebalancing)
    function updateAndWithdraw(uint256 _identityBalance, uint256 _hubBalance, 
                               uint256 _identityWithdraw, uint256 _hubWithdraw,
                               uint256 _sequence, uint256 _timeout, bytes memory _identitySig, bytes memory _hubSig) public {
        require(now <= _timeout, "fast withdraw signatures timeout");
        require(_sequence > lastSequence, "provided sequence must be bigger than already seen");
        require(_identityBalance.add(_hubBalance).add(_identityWithdraw).add(_hubWithdraw) == token.balanceOf(address(this)), "sum of balances must be equal to amount of locked tokens");

        bytes32 _hash = keccak256(abi.encodePacked(REBALANCE_PREFIX, _identityBalance, _hubBalance, _identityWithdraw, _hubWithdraw, _sequence, _timeout));

        address _recoveredIdentity = _hash.recover(_identitySig);
        require(_recoveredIdentity == identityHash, "wrong identity signature");

        address _recoveredHub = _hash.recover(_hubSig);
        require(_recoveredHub == hubId, "wrong hub signature");

        // Withdraw funds
        if (_identityWithdraw > 0) {
            token.transfer(identityHash, _identityWithdraw); // TODO point where to withdraw
            emit FundsWithdrawn(identityHash, identityHash, _identityWithdraw);
        }

        if (_hubWithdraw > 0) {
            token.transfer(hubId, _hubWithdraw);
            emit FundsWithdrawn(hubId, hubId, _hubWithdraw);
        }

        require(_identityBalance.add(_hubBalance) == token.balanceOf(address(this)), "sum of balances must be equal to amount of locked tokens");

        // Update channel state
        identityBalance = _identityBalance;
        hubBalance = _hubBalance;
        lastSequence = _sequence;

        emit ChannelStateUpdated(identityBalance, hubBalance, lastSequence);
    }

    /*
        Exit (withdrawal with delay for challanges/channel state updates)
    */

    // TODO add bounty for challenge.
    // Start emergency withdrawal of all funds --> usually when another party is not collaborating for `updateAndWithdraw`
    function exitRequest(address _party, address _beneficiary, bytes memory _signature) public {
        require(_party == identityHash || _party == hubId, "party should be either identity either hub");
        require(_beneficiary != address(0), "tokens can't be burned");
        // require(channel.status == ChannelStatus.Open, "channel must be open");

        address _recoveredParty = keccak256(abi.encodePacked(EXIT_PREFIX, _party, _beneficiary)).recover(_signature);
        require(_recoveredParty == _party, "wrong signature");

        // channel.status = ChannelStatus.ChannelDispute;
        uint256 _timeout = now.add(challengePeriod);
        pendingWithdrawal = Withdrawal(_party, _beneficiary,  _timeout);

        emit ExitRequested(_party, _timeout);
    }

    // Emergency withdrawal when there are not signature from another party
    function updateAndExit(address _party, address _beneficiary, bytes memory _signature,
                           uint256 _identityBalance, uint256 _hubBalance, 
                           uint256 _sequence, bytes memory _identitySig, bytes memory _hubSig) public {
        require(_party == identityHash || _party == hubId, "party should be either identity either hub");
        
        update(_identityBalance, _hubBalance, _sequence, _identitySig, _hubSig); // Update channel into last known state
        exitRequest(_party, _beneficiary, _signature);
    }

    function finalizeExit() public {
        require(pendingWithdrawal.party != address(0), "there should be pending withdrawal");
        require(pendingWithdrawal.timeout != 0 && now > pendingWithdrawal.timeout, "timeout should be passed");

        uint256 _amount;

        if (pendingWithdrawal.party == identityHash) {
            _amount = identityBalance;
            identityBalance = 0;
        } else {
            _amount = hubBalance;
            hubBalance = 0;
        }
        
        token.transfer(pendingWithdrawal.beneficiary, _amount);
        pendingWithdrawal = Withdrawal(address(0), address(0), 0);

        emit FundsWithdrawn(pendingWithdrawal.party, pendingWithdrawal.beneficiary, _amount);
    }

    /*
        Helpers
    */
    string constant PERIOD_CHANGE_PREFIX = "Challenge period change request:";
    event ChallengePeriodChanged(uint256 challengePeriod);
    function updateChallengePeriod(uint256 _newChallengePediod, bytes memory _identitySig, bytes memory _hubSig) public {
        bytes32 _hash = keccak256(abi.encodePacked(PERIOD_CHANGE_PREFIX, _newChallengePediod));

        address _recoveredIdentity = _hash.recover(_identitySig);
        require(_recoveredIdentity == identityHash, "wrong identity signature");

        address _recoveredHub = _hash.recover(_hubSig);
        require(_recoveredHub == hubId, "wrong hub signature");    
    
        challengePeriod = _newChallengePediod;

        emit ChallengePeriodChanged(_newChallengePediod);
    }

    // Setting new destination of funds recovery.
    string constant FUNDS_DESTINATION_PREFIX = "Set funds destination:";
    function setFundsDestinationByCheque(address payable _newDestination, bytes memory _signature) public {
        require(_newDestination != address(0));

        address _signer = keccak256(abi.encodePacked(FUNDS_DESTINATION_PREFIX, _newDestination)).recover(_signature);
        require(_signer == identityHash, "Have to be signed by proper identity");

        emit DestinationChanged(fundsDestination, _newDestination);
        fundsDestination = _newDestination;
    }
}
