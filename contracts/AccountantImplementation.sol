pragma solidity ^0.5.8;

import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface IdentityRegistry {
    function isRegistered(address _identityHash) external view returns (bool);
}

// Uni-directional settle based accountant
contract AccountantImplementation is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant OPENCHANNEL_PREFIX = "Open channel request";
    string constant UPDATE_PREFIX = "Update channel balance";
    string constant LOAN_RETURN_PREFIX = "Load return request";
    string constant RESET_LOAN_RETURN_PREFIX = "Reset loan return request";
    uint256 constant DELAY_BLOCKS = 18000;  // +/- 3 days

    IdentityRegistry internal registry;
    address internal operator;
    uint256 public timelock;               // block number after which exit can be finalised
    uint256 internal lockedFunds;
    uint256 internal lastUsedNonce;        // nonce used to protect signature based calls from repply attack

    struct Channel {
        address beneficiary;        // address where funds will be send
        uint256 balance;            // amount available to settle
        uint256 settled;            // total amount already settled by provider
        uint256 loan;               // amount lended by party to accountant
        uint256 loanTimelock;       // block number after which exit can be finalized
        uint256 lastUsedNonce;      // last known nonce, is used to protect signature based calls from repply attack
    }
    mapping(bytes32 => Channel) public channels;

    function getOperator() public view returns (address) {
        return operator;
    }

    function getChannelId(address _party) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_party, address(this)));
    }

    function getRegistry() public view returns (address) {
        return address(registry);
    }

    event ChannelOpened(bytes32 channelId, uint256 initialBalance);
    event NewLoan(bytes32 channelId, uint256 loadAmount);
    event PromiseSettled(bytes32 channelId, address beneficiary, uint256 amount, uint256 totalSettled);
    event LoanReturnRequested(bytes32 channelId, uint256 timelock);
    event LoanReturnRequestInvalidated(bytes32 channelId);
    event LoanReturned(bytes32 channelId, address beneficiary, uint256 amount);
    event ChannelBeneficiaryChanged(bytes32 _channelId, address _newBeneficiary);

    /*
      ------------------------------------------- SETUP -------------------------------------------
    */

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialize(address _token, address _operator) public {
        require(!isInitialized(), "have to be not initialized");
        require(_operator != address(0), "operator have to be set");
        require(_token != address(0), "token can't be deployd into zero address");

        token = IERC20(_token);
        registry = IdentityRegistry(msg.sender);
        operator = _operator;
    }

    function isInitialized() public view returns (bool) {
        return operator != address(0);
    }

    /*
      -------------------------------------- MAIN FUNCTIONALITY -----------------------------------
    */

    // Open incomming payments (also known as provider) channel.
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend, bytes memory _signature) public {
        // Registry don't need signature to open channel in name of identity
        if (msg.sender != address(registry)) {
            address _signer = keccak256(abi.encodePacked(OPENCHANNEL_PREFIX, address(this), _party, _beneficiary, _amountToLend)).recover(_signature);
            require(_signer == _party, "request have to be signed by party");
            require(registry.isRegistered(_signer), "identity have to be already registered");
        }

        // channel ID is keccak(identityHash, accountantID)
        bytes32 _channelId = keccak256(abi.encodePacked(_party, address(this)));
        require(!isOpened(_channelId), "channel should be not opened yet");

        channels[_channelId].beneficiary = _beneficiary;
        channels[_channelId].balance = _amountToLend;
        lockedFunds = lockedFunds.add(_amountToLend);

        // During opening new channel user can lend some funds to be guaranteed on channels size
        if (_amountToLend > 0) {
            require(token.transferFrom(msg.sender, address(this), _amountToLend), "token transfer should succeed");
            channels[_channelId].loan = _amountToLend;
            emit NewLoan(_channelId, _amountToLend);
        }

        emit ChannelOpened(_channelId, _amountToLend);
    }

    // Settle promise
    // _lock is random number generated by receiver used in HTLC
    function settlePromise(bytes32 _channelId, uint256 _amount, uint256 _fee, bytes32 _lock, bytes32 _extraDataHash, bytes memory _signature) public {
        Channel storage _channel = channels[_channelId];
        require(_channel.beneficiary != address(0), "channel should exist");

        bytes32 _hashlock = keccak256(abi.encodePacked(_lock));
        address _signer = keccak256(abi.encodePacked(_channelId, _amount, _fee, _hashlock, _extraDataHash)).recover(_signature);
        require(_signer == operator, "have to be signed by channel operator");

        // Calculate amount of tokens to be claimed.
        uint256 _unpaidAmount = _amount.sub(_channel.settled);
        require(_unpaidAmount > 0, "amount to settle should be greater that already settled");

        // If signer has less tokens than asked to transfer, we can transfer as much as he has already
        // and rest tokens can be transferred via same promise but in another tx 
        // when signer will top up channel balance.
        uint256 _currentBalance = _channel.balance;
        if (_unpaidAmount > _currentBalance) {
            _unpaidAmount = _currentBalance;
        }

        // Increase already paid amount
        _channel.settled = _channel.settled.add(_unpaidAmount);

        // Transfer tokens and decrease balance
        token.transfer(_channel.beneficiary, _unpaidAmount.sub(_fee));
        _channel.balance = _channel.balance.sub(_unpaidAmount);
        lockedFunds = lockedFunds.sub(_unpaidAmount);

        // Pay fee
        if (_fee > 0) {
            token.transfer(msg.sender, _fee);
        }

        emit PromiseSettled(_channelId, _channel.beneficiary, _unpaidAmount, _channel.settled);
    }

    // Updating collatered to channel amount - executed by operator
    function updateChannelBalance(bytes32 _channelId, uint256 _nonce, uint256 _newBalance, bytes memory _signature) public {
        require(isOpened(_channelId), "channel have to be opened");
        require(_nonce > lastUsedNonce, "nonce have to be bigger than already used");

        if (msg.sender != operator) {
            address _signer = keccak256(abi.encodePacked(UPDATE_PREFIX, _channelId, _nonce, _newBalance)).recover(_signature);
            require(_signer == operator, "have to be signed by operator");
        }

        __channelRebalance(_channelId, _newBalance);
        lastUsedNonce = _nonce;

        // TODO don't allow to decrease less than loan amount
    }

    // Possibility to increase channel ballance without operator's signature (up to lended amount)
    function rebalanceChannel(bytes32 _channelId) public {
        uint256 _newBalance = channels[_channelId].loan;
        require(_newBalance > channels[_channelId].balance, "new balance should be bigger that current");

        __channelRebalance(_channelId, _newBalance);
    }

    function __channelRebalance(bytes32 _channelId, uint256 _newBalance) internal {
        Channel storage _channel = channels[_channelId];

        // Topup channel / increase balance
        if (_newBalance > _channel.balance) {
            uint256 diff = _channel.balance.sub(_newBalance);
            lockedFunds = lockedFunds.add(diff);
            require(token.balanceOf(address(this)) >= lockedFunds, "accountant should have enought funds");
        }

        _channel.balance = _newBalance;
    }

    function withdraw() public {
        // only operator, send some funds out.
    }

    /*
      -------------------------------------- LOAN MANAGEMENT --------------------------------------
    */

    // Anyone can increase channel's capacity by lending more for accountant
    function increaseLoan(bytes32 _channelId, uint256 _amount) public {
        require(isOpened(_channelId), "channel have to be opened");
        Channel storage _channel = channels[_channelId];

        require(token.transferFrom(msg.sender, address(this), _amount), "transfer have to be successfull");
        _channel.loan = _channel.loan.add(_amount);
        emit NewLoan(_channelId, _amount);
    } 

    // 
    function requestLoanReturn(address _party, uint256 _nonce, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_party);
        Channel storage _channel = channels[_channelId];
        uint256 _timelock = block.number.add(180000);  // block number until which to wait --> around 30 days

        require(_channel.loan > 0 && _channel.loanTimelock == 0, "loan return can be requested only there are no open requests");
        require(_nonce > _channel.lastUsedNonce, "nonce have to be bigger than already used");

        if(msg.sender != _party) {
            address _signer = keccak256(abi.encodePacked(LOAN_RETURN_PREFIX, _channelId, _nonce)).recover(_signature);
            require(_signer == _party, "have to be signed by channel party");
        }

        _channel.lastUsedNonce = _nonce;
        _channel.loanTimelock = _timelock;

        emit LoanReturnRequested(_channelId, _timelock);
    }

    function finalizeLoanReturn(bytes32 _channelId) public {
        Channel storage _channel = channels[_channelId];
        require(_channel.loanTimelock != 0 && block.number >= _channel.loanTimelock, "loan return have to be requested and block timelock have to be in past");

        token.transfer(_channel.beneficiary, _channel.loan);
        _channel.loan = 0;
        _channel.loanTimelock = 0;

        emit LoanReturned(_channelId, _channel.beneficiary, _channel.loan);
    }

    /*
      ------------------------------------------ HELPERS ------------------------------------------
    */

    function setBeneficiary(address _party, address _newBeneficiary, uint256 _nonce, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_party);
        Channel storage _channel = channels[_channelId];

        require(isOpened(_channelId), "channel have to be opened");

        if (msg.sender != _party) {
            require(_nonce > _channel.lastUsedNonce, "nonce have to be bigger than already used");
            _channel.lastUsedNonce = _nonce;

            address _signer = keccak256(abi.encodePacked(_channelId, _newBeneficiary, _nonce)).recover(_signature);
            require(_signer == _party, "have to be signed by channel party");
        }

        _channel.beneficiary = _newBeneficiary;

        emit ChannelBeneficiaryChanged(_channelId, _newBeneficiary);
    }

    function isOpened(bytes32 _channelId) public view returns (bool) {
        return channels[_channelId].beneficiary != address(0);
    }

    // Funds not locked in any channel and free to be topuped or withdrawned
    function availableBalance() public view returns (uint256) {
        return token.balanceOf(address(this)).sub(lockedFunds);
    }

    // Setting new destination of funds recovery.
    string constant FUNDS_DESTINATION_PREFIX = "Set funds destination:";
    function setFundsDestinationByCheque(address payable _newDestination, uint256 _nonce, bytes memory _signature) public {
        require(_newDestination != address(0));

        if (msg.sender != operator) {
            require(_nonce > lastUsedNonce, "nonce have to be bigger than already used");
            lastUsedNonce = _nonce;

            address _signer = keccak256(abi.encodePacked(FUNDS_DESTINATION_PREFIX, _newDestination, _nonce)).recover(_signature);
            require(_signer == operator, "Have to be signed by proper identity");
        }

        emit DestinationChanged(fundsDestination, _newDestination);
        fundsDestination = _newDestination;
    }

}
