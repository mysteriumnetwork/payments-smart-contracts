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
    string constant WITHDRAW_PREFIX = "Withdraw request";
    string constant UPDATE_FEE_PREFIX = "Update accountant fee";
    uint256 constant DELAY_BLOCKS = 18000;  // +/- 3 days

    IdentityRegistry internal registry;
    address internal operator;
    uint256 public timelock;               // block number after which exit can be finalised
    uint256 internal lockedFunds;
    uint256 internal totalLoan;
    uint256 internal lastUsedNonce;        // nonce used to protect signature based calls from repply attack

    struct AccountantFee {
        uint16 value;                      // subprocent amount. e.g. 2.5% = 250
        uint64 validFrom;                  // block from which fee is valid
    }
    AccountantFee internal lastFee;        // default fee to look for
    AccountantFee internal previousFee;    // previous fee is used if last fee is still not active

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
    event ChannelBalanceUpdated(bytes32 indexed channelId, uint256 amount, uint256 newBalance);
    event NewLoan(bytes32 channelId, uint256 loadAmount);
    event PromiseSettled(bytes32 indexed channelId, address beneficiary, uint256 amount, uint256 totalSettled);
    event LoanReturnRequested(bytes32 channelId, uint256 timelock);
    event LoanReturnRequestInvalidated(bytes32 channelId);
    event LoanReturned(bytes32 channelId, address beneficiary, uint256 amount);
    event ChannelBeneficiaryChanged(bytes32 channelId, address newBeneficiary);
    event FundsWithdrawned(uint256 amount, address beneficiary);
    event AccountantFeeUpdated(uint16 newFee, uint64 validFromBlock);

    /*
      ------------------------------------------- SETUP -------------------------------------------
    */

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialize(address _token, address _operator, uint16 _fee) public {
        require(!isInitialized(), "have to be not initialized");
        require(_operator != address(0), "operator have to be set");
        require(_token != address(0), "token can't be deployd into zero address");
        require(_fee <= 5000, "fee can't be bigger that 50%");

        token = IERC20(_token);
        registry = IdentityRegistry(msg.sender);
        operator = _operator;
        lastFee = AccountantFee(_fee, uint64(block.number));
    }

    function isInitialized() public view returns (bool) {
        return operator != address(0);
    }

    /*
      -------------------------------------- MAIN FUNCTIONALITY -----------------------------------
    */

    // Open incomming payments (also known as provider) channel.
    function openChannel(address _party, address _beneficiary, uint256 _amountToLend) public {
        require(msg.sender == address(registry), "only registry can open channels");

        // channel ID is keccak(identityHash, accountantID)
        bytes32 _channelId = keccak256(abi.encodePacked(_party, address(this)));
        require(!isOpened(_channelId), "channel should be not opened yet");

        channels[_channelId].beneficiary = _beneficiary;
        channels[_channelId].balance = _amountToLend;

        // During opening new channel user can lend some funds to be guaranteed on channels size
        if (_amountToLend > 0) {
            require(token.transferFrom(msg.sender, address(this), _amountToLend), "token transfer should succeed");

            lockedFunds = lockedFunds.add(_amountToLend);            
            channels[_channelId].loan = _amountToLend;
            totalLoan = totalLoan.add(_amountToLend);

            emit NewLoan(_channelId, _amountToLend);
        }

        emit ChannelOpened(_channelId, _amountToLend);
    }

    // Settle promise
    // _lock is random number generated by receiver used in HTLC
    function settlePromise(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature) public {
        Channel storage _channel = channels[_channelId];
        require(_channel.beneficiary != address(0), "channel should exist");

        bytes32 _hashlock = keccak256(abi.encodePacked(_lock));
        address _signer = keccak256(abi.encodePacked(_channelId, _amount, _transactorFee, _hashlock)).recover(_signature);
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

        // Canculate accountant fee
        uint256 _accountantFee = getAccountantFee(_unpaidAmount);

        // Transfer tokens and decrease balance
        token.transfer(_channel.beneficiary, _unpaidAmount.sub(_transactorFee).sub(_accountantFee));
        _channel.balance = _currentBalance.sub(_unpaidAmount);
        lockedFunds = lockedFunds.sub(_unpaidAmount);

        // Pay fee
        if (_transactorFee > 0) {
            token.transfer(msg.sender, _transactorFee);
        }

        emit PromiseSettled(_channelId, _channel.beneficiary, _unpaidAmount, _channel.settled);
    }

    // Updating collatered to channel amount - executed by operator
    // TODO accountant should be able to decrease only with timelock
    function updateChannelBalance(bytes32 _channelId, uint256 _nonce, uint256 _newBalance, bytes memory _signature) public {
        require(isOpened(_channelId), "channel have to be opened");
        require(_nonce > lastUsedNonce, "nonce have to be bigger than already used");
        require(_newBalance >= channels[_channelId].loan, "balance can't be less than loan amount");

        if (msg.sender != operator) {
            address _signer = keccak256(abi.encodePacked(UPDATE_PREFIX, _channelId, _nonce, _newBalance)).recover(_signature);
            require(_signer == operator, "have to be signed by operator");
        }

        __channelRebalance(_channelId, _newBalance);
        lastUsedNonce = _nonce;
    }

    // Possibility to increase channel ballance without operator's signature (up to lended amount)
    // TODO should not allow rebalance if there is loan return request (`_channel.loanTimelock != 0`)
    function rebalanceChannel(bytes32 _channelId) public {
        uint256 _newBalance = channels[_channelId].loan;
        require(_newBalance > channels[_channelId].balance, "new balance should be bigger that current");

        __channelRebalance(_channelId, _newBalance);
    }

    function __channelRebalance(bytes32 _channelId, uint256 _newBalance) internal {
        Channel storage _channel = channels[_channelId];
        uint256 diff;

        if (_newBalance > _channel.balance) {
            diff = _newBalance.sub(_channel.balance);
            lockedFunds = lockedFunds.add(diff);
            require(token.balanceOf(address(this)) >= lockedFunds, "accountant should have enought funds");
        } else {
            diff = _channel.balance.sub(_newBalance);
            lockedFunds = lockedFunds.sub(diff);
        }

        _channel.balance = _newBalance;

        emit ChannelBalanceUpdated(_channelId, diff, _newBalance);
    }

    function withdraw(address _beneficiary, uint256 _amount, uint256 _nonce, bytes memory _signature) public {
        require(_nonce > lastUsedNonce, "nonce have to be bigger than already used");

        // If transaction sent not by operator signature must be verified
        if (msg.sender != operator) {
            address _signer = keccak256(abi.encodePacked(WITHDRAW_PREFIX, _beneficiary, _amount, _nonce)).recover(_signature);
            require(_signer == operator, "have to be signed by operator");
        }

        // Accountants can't withdraw locked in channel funds and funds lended to him
        uint256 _possibleAmountToTransfer = token.balanceOf(address(this)).sub(max(lockedFunds, totalLoan));
        require(_possibleAmountToTransfer >= _amount, "should be enough funds available to withdraw");

        token.transfer(_beneficiary, _amount);

        emit FundsWithdrawned(_amount, _beneficiary);
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

        __channelRebalance(_channelId, _channel.loan);
        totalLoan = totalLoan.add(_amount);

        emit NewLoan(_channelId, _amount);
    } 

    // TODO add possibility to decrease loan instead of withdrawing all 
    function requestLoanReturn(address _party, uint256 _nonce, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_party);
        Channel storage _channel = channels[_channelId];

        uint256 _timelock = getTimelock();  // block number until which to wait

        require(_channel.loan > 0 && _channel.loanTimelock == 0, "loan return can be requested only if there are no open requests");
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

        // Decrease channel balance
        uint256 _diff = (_channel.balance > _channel.loan) ? _channel.balance.sub(_channel.loan) : _channel.balance;
        _channel.balance = _channel.balance.sub(_diff);
        lockedFunds = lockedFunds.sub(_diff);

        // Return loan
        token.transfer(_channel.beneficiary, _channel.loan);
        totalLoan = totalLoan.sub(_channel.loan);
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

    function setAccountantFee(uint16 _newFee, bytes memory _signature) public {
        require(_newFee <= 5000, "fee can't be bigger that 50%");

        if (msg.sender != operator) {
            address _signer = keccak256(abi.encodePacked(UPDATE_FEE_PREFIX, address(this), _newFee)).recover(_signature);
            require(_signer == operator, "have to be signed by accountant operator");
        }

        // new fee will start be valid after delay block will pass
        uint64 _validFrom = uint64(block.number + DELAY_BLOCKS);

        previousFee = lastFee;
        lastFee = AccountantFee(_newFee, _validFrom);

        emit AccountantFeeUpdated(_newFee, _validFrom);
    }

    function getAccountantFee(uint256 _amount) public view returns (uint256) {
        AccountantFee memory _activeFee = (block.number > lastFee.validFrom) ? lastFee : previousFee;
        return (_amount * uint256(_activeFee.value)) / 100;
    }

    function isOpened(bytes32 _channelId) public view returns (bool) {
        return channels[_channelId].beneficiary != address(0);
    }

    // Funds not locked in any channel and free to be topuped or withdrawned
    function availableBalance() public view returns (uint256) {
        return token.balanceOf(address(this)).sub(lockedFunds);
    }

    // Returns blocknumber until which exit request should be locked
    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function max(uint a, uint b) private pure returns (uint) {
        return a > b ? a : b;
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
