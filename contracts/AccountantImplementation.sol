pragma solidity ^0.5.12;

import { ECDSA } from "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "openzeppelin-solidity/contracts/math/SafeMath.sol";
import { IERC20 } from "openzeppelin-solidity/contracts/token/ERC20/IERC20.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface IdentityRegistry {
    function isRegistered(address _identityHash) external view returns (bool);
    function minimalAccountantStake() external view returns (uint256);
}

// Uni-directional settle based accountant
contract AccountantImplementation is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant LOAN_RETURN_PREFIX = "Load return request";
    uint256 constant DELAY_BLOCKS = 18000;  // +/- 3 days

    IdentityRegistry internal registry;
    address internal operator;
    uint256 internal lockedFunds;              // funds locked in channels
    uint256 internal totalLoan;                // total amount lended by providers
    uint256 internal maxLoan;                  // maximal allowed provider's loan
    uint256 internal stake;                    // accountant stake is used to prove accountant's sustainability

    enum Status { Active, Paused, Punishment, Closed } // accountant states
    Status internal status;

    struct AccountantFee {
        uint16 value;                      // subprocent amount. e.g. 2.5% = 250
        uint64 validFrom;                  // block from which fee is valid
    }
    AccountantFee public lastFee;          // default fee to look for
    AccountantFee public previousFee;      // previous fee is used if last fee is still not active

    struct Channel {
        address beneficiary;        // address where funds will be send
        uint256 balance;            // amount available to settle
        uint256 settled;            // total amount already settled by provider
        uint256 loan;               // amount lended by party to accountant
        uint256 lastUsedNonce;      // last known nonce, is used to protect signature based calls from repply attack
        uint256 timelock;           // blocknumber after which channel balance can be decreased
    }
    mapping(bytes32 => Channel) public channels;

    struct Punishment {
        uint256 activationBlock;    // block number in which punishment was activated
        uint256 amount;             // total amount of tokens locked because of punishment
    }
    Punishment public punishment;

    function getOperator() public view returns (address) {
        return operator;
    }

    function getChannelId(address _party) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_party, address(this)));
    }

    function getRegistry() public view returns (address) {
        return address(registry);
    }

    function getStake() public view returns (uint256) {
        return stake;
    }

    // Returns accountant state
    // Active - all operations are allowed.
    // Paused - no new channel openings.
    // Punishment - don't allow to open new channels, rebalance and withdraw funds.
    // Closed - no new channels, no rebalance, no stake increase.
    function getStatus() public view returns (Status) {
        return status;
    }

    event ChannelOpened(bytes32 channelId, uint256 initialBalance);
    event ChannelBalanceUpdated(bytes32 indexed channelId, uint256 newBalance);
    event ChannelBalanceDecreaseRequested(bytes32 indexed channelId);
    event NewLoan(bytes32 indexed channelId, uint256 loanAmount);
    event MaxLoanValueUpdated(uint256 _newMaxLoan);
    event PromiseSettled(bytes32 indexed channelId, address beneficiary, uint256 amount, uint256 totalSettled);
    event ChannelBeneficiaryChanged(bytes32 channelId, address newBeneficiary);
    event AccountantFeeUpdated(uint16 newFee, uint64 validFromBlock);
    event AccountantClosed(uint256 blockNumber);
    event ChannelOpeningPaused();
    event ChannelOpeningActivated();
    event FundsWithdrawned(uint256 amount, address beneficiary);
    event AccountantStakeIncreased(uint256 newStake);
    event AccountantPunishmentActivated(uint256 activationBlock);
    event AccountantPunishmentDeactivated();
    event NewAccountantOperator(address newOperator);

    modifier onlyOperator() {
        require(msg.sender == operator, "only operator can call this function");
        _;
    }

    /*
      ------------------------------------------- SETUP -------------------------------------------
    */

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialize(address _token, address _operator, uint16 _fee, uint256 _maxLoan) public {
        require(!isInitialized(), "have to be not initialized");
        require(_operator != address(0), "operator have to be set");
        require(_token != address(0), "token can't be deployd into zero address");
        require(_fee <= 5000, "fee can't be bigger than 50%");

        token = IERC20(_token);
        registry = IdentityRegistry(msg.sender);
        operator = _operator;
        lastFee = AccountantFee(_fee, uint64(block.number));
        maxLoan = _maxLoan;
        stake = token.balanceOf(address(this));
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
        require(getStatus() == Status.Active, "accountant have to be in active state");

        // channel ID is keccak(identityHash, accountantID)
        bytes32 _channelId = keccak256(abi.encodePacked(_party, address(this)));
        require(!isOpened(_channelId), "channel have to be not opened yet");

        channels[_channelId].beneficiary = _beneficiary;
        channels[_channelId].balance = _amountToLend;

        // During opening new channel user can lend some funds to be guaranteed on channels size
        if (_amountToLend > 0) {
            require(_amountToLend <= maxLoan, "amount to lend can't be bigger that maximally allowed");
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

        // Calculate accountant fee
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

    // Accountant can update channel balance by himself. He can update into any amount size 
    // but not less that provider's loan amount.
    function updateChannelBalance(bytes32 _channelId, uint256 _newBalance) public onlyOperator {
        require(isAccountantActive(), "accountant have to be active");
        require(isOpened(_channelId), "channel have to be opened");
        require(_newBalance >= channels[_channelId].loan, "balance can't be less than loan amount");

        Channel storage _channel = channels[_channelId];
        uint256 _diff;

        if (_newBalance > _channel.balance) {
            _diff = _newBalance.sub(_channel.balance);
            require(availableBalance() >= _diff, "should be enough available balance");
            lockedFunds = lockedFunds.add(_diff);
        } else {
            // If timelock is 0 then we should enable waiting period
            if (_channel.timelock == 0) {
                _channel.timelock = getTimelock();
                emit ChannelBalanceDecreaseRequested(_channelId);
                return;
            }

            // It's still waiting period, do nothing
            if (block.number < _channel.timelock) {
                return;
            }

            _diff = _channel.balance.sub(_newBalance);
            lockedFunds = lockedFunds.sub(_diff);
            _channel.timelock = 0;
        }

        _channel.balance = _newBalance;

        emit ChannelBalanceUpdated(_channelId, _channel.balance);
    }

    // Possibility to increase channel ballance without operator's signature (up to lended amount)
    function rebalanceChannel(bytes32 _channelId) public {
        require(isAccountantActive(), "accountant have to be active");

        Channel storage _channel = channels[_channelId];
        require(_channel.loan > _channel.balance, "new balance should be bigger that current");

        uint256 _increaseAmount = _channel.loan.sub(_channel.balance);

        // If there are not enought funds to rebalance we have to enable punishment mode and rebalance into max possible amount.
        uint256 _minimalExpectedBalance = minimalExpectedBalance().add(_increaseAmount);
        uint256 _currentBalance = token.balanceOf(address(this));
        if (_currentBalance < _minimalExpectedBalance) {
            status = Status.Punishment;
            punishment.activationBlock = block.number;
            _increaseAmount = _minimalExpectedBalance.sub(_currentBalance);
            emit AccountantPunishmentActivated(block.number);
        }

        lockedFunds = lockedFunds.add(_increaseAmount);
        _channel.balance = _channel.balance.add(_increaseAmount);

        emit ChannelBalanceUpdated(_channelId, _channel.balance);
    }

    // Accountant's available funds withdrawal. Can be done only if chanel is not closed and not in punishment mode.
    // Accountant can't withdraw stake, locked in channel funds and funds lended to him.
    function withdraw(address _beneficiary, uint256 _amount) public onlyOperator {
        require(isAccountantActive(), "accountant have to be active");
        require(availableBalance() >= _amount, "should be enough funds available to withdraw");

        token.transfer(_beneficiary, _amount);

        emit FundsWithdrawned(_amount, _beneficiary);
    }

    /*
      -------------------------------------- LOAN MANAGEMENT --------------------------------------
    */

    // Anyone can increase channel's capacity by lending more for accountant
    function increaseLoan(bytes32 _channelId, uint256 _amount) public {
        require(isOpened(_channelId), "channel have to be opened");
        require(getStatus() != Status.Closed, "accountant should be not closed");

        Channel storage _channel = channels[_channelId];

        uint256 _newLoanAmount = _channel.loan.add(_amount);
        require(_newLoanAmount <= maxLoan, "amount to lend can't be bigger that maximally allowed");

        // TODO Transfer from consumer channel instead of msg.sender
        require(token.transferFrom(msg.sender, address(this), _amount), "transfer have to be successfull");

        lockedFunds = lockedFunds.add(_newLoanAmount.sub(_channel.balance));
        totalLoan = totalLoan.add(_amount);
        _channel.balance = _newLoanAmount;
        _channel.loan = _newLoanAmount;

        emit ChannelBalanceUpdated(_channelId, _newLoanAmount);
        emit NewLoan(_channelId, _amount);
    }

    // Withdraw part of loan. This will also decrease channel balance. 
    function decreaseLoan(bytes32 _channelId, uint256 _amount, uint256 _nonce, bytes memory _signature) public {
        address _signer = keccak256(abi.encodePacked(LOAN_RETURN_PREFIX, _channelId, _amount, _nonce)).recover(_signature);
        require(getChannelId(_signer) == _channelId, "have to be signed by channel party");

        require(isOpened(_channelId), "channel have to be opened");
        Channel storage _channel = channels[_channelId];

        require(_nonce > _channel.lastUsedNonce, "nonce have to be bigger than already used");
        _channel.lastUsedNonce = _nonce;

        require(_amount <= _channel.loan, "can't withdraw more than lended");

        uint256 _channelBalanceDiff = min(_channel.balance, _amount);

        // Enable punishment mode when accountnant token amount after loan decrease if less than minimal expected.
        uint256 _minimalExpectedBalance = minimalExpectedBalance().sub(_channelBalanceDiff);
        uint256 _currentBalance = token.balanceOf(address(this));
        if (_amount > _currentBalance || _currentBalance.sub(_amount) < _minimalExpectedBalance) {
            if (isAccountantActive()) {
                status = Status.Punishment;
                punishment.activationBlock = block.number;
                emit AccountantPunishmentActivated(block.number);
            }
            _amount = _currentBalance.sub(_minimalExpectedBalance);
        }

        uint256 _newLoanAmount = _channel.loan.sub(_amount);
        require(_newLoanAmount <= maxLoan, "amount to lend can't be bigger that maximally allowed");

        token.transfer(_channel.beneficiary, _amount);

        _channel.loan = _newLoanAmount;
        _channel.balance = _channel.balance.sub(_channelBalanceDiff);
        lockedFunds = lockedFunds.sub(_channelBalanceDiff);
        totalLoan = totalLoan.sub(_amount);

        emit ChannelBalanceUpdated(_channelId, _channel.balance);
        emit NewLoan(_channelId, _newLoanAmount);
    }

    /*
      ------------------------------------------ HELPERS ------------------------------------------
    */

    function resolveEmergency() public {
        require(getStatus() == Status.Punishment, "accountant should be in punishment status");

        // 0.04% of total channels amount per unit
        uint256 _punishmentPerUnit = round(lockedFunds, 10000).div(10000).mul(4);

        // 1 unit = 1 hour = 257 blocks. No punishment during first unit.
        uint256 _blocksPassed = block.number - punishment.activationBlock;
        uint256 _punishmentUnits = (round(_blocksPassed, 257) / 257).sub(1);

        uint256 _punishmentAmount = _punishmentUnits.mul(_punishmentPerUnit);
        punishment.amount = punishment.amount.add(_punishmentAmount);

        uint256 _shouldHave = max(lockedFunds, totalLoan).add(max(stake, punishment.amount));
        uint256 _currentBalance = token.balanceOf(address(this));
        uint256 _missingFunds = (_currentBalance < _shouldHave) ? _shouldHave.sub(_currentBalance) : uint256(0);

        // If there are not enough available funds, they have to be topuped from msg.sender.
        token.transferFrom(msg.sender, address(this), _missingFunds);

        // Disable punishment mode
        status = Status.Active;

        emit AccountantPunishmentDeactivated();
    }

    // TODO unify with other similar calls and instead of _party use _channelId
    function setBeneficiary(address _party, address _newBeneficiary, uint256 _nonce, bytes memory _signature) public {
        require(_newBeneficiary != address(0), "beneficiary can't be zero address");
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

    function setAccountantOperator(address _newOperator) public onlyOperator {
        require(_newOperator != address(0), "can't be zero address");
        operator = _newOperator;
        emit NewAccountantOperator(_newOperator);
    }

    function setMaxLoan(uint256 _newMaxLoan) public onlyOperator {
        require(isAccountantActive(), "accountant have to be active");
        maxLoan = _newMaxLoan;
        emit MaxLoanValueUpdated(_newMaxLoan);
    }

    function setAccountantFee(uint16 _newFee) public onlyOperator {
        require(getStatus() != Status.Closed, "accountant should be not closed");
        require(_newFee <= 5000, "fee can't be bigger that 50%");
        require(block.number >= lastFee.validFrom, "can't update inactive fee");

        // new fee will start be valid after delay block will pass
        uint64 _validFrom = uint64(getTimelock());

        previousFee = lastFee;
        lastFee = AccountantFee(_newFee, _validFrom);

        emit AccountantFeeUpdated(_newFee, _validFrom);
    }

    // TODO rename into CalculateAccountantFeeOf(uint256 _amount)
    function getAccountantFee(uint256 _amount) public view returns (uint256) {
        AccountantFee memory _activeFee = (block.number >= lastFee.validFrom) ? lastFee : previousFee;
        return round((_amount * uint256(_activeFee.value) / 100), 100) / 100;
    }

    function increaseAccountantStake(uint256 _additionalStake) public onlyOperator {
        if (availableBalance() < _additionalStake) {
            uint256 _diff = _additionalStake.sub(availableBalance());
            token.transferFrom(msg.sender, address(this), _diff);
        }

        stake = stake.add(_additionalStake);

        emit AccountantStakeIncreased(stake);
    }

    function isOpened(bytes32 _channelId) public view returns (bool) {
        return channels[_channelId].beneficiary != address(0);
    }

    // If Accountant is not closed and is not in punishment mode, he is active.
    function isAccountantActive() public view returns (bool) {
        Status _status = getStatus();
        return _status != Status.Punishment && _status != Status.Closed;
    }

    function pauseChannelOpening() public onlyOperator {
        require(getStatus() == Status.Active, "accountant have to be in active state");
        status = Status.Paused;
        emit ChannelOpeningPaused();
    } 

    function activateChannelOpening() public onlyOperator {
        require(getStatus() == Status.Paused, "accountant have to be in paused state");
        status = Status.Active;
        emit ChannelOpeningActivated();
    }

    // Returns funds amount not locked in any channel, not staked and not lended from providers.
    function availableBalance() public view returns (uint256) {
        uint256 _totalLockedAmount = max(lockedFunds, totalLoan).add(max(stake, punishment.amount));
        if (_totalLockedAmount > token.balanceOf(address(this))) {
            return uint256(0);
        }
        return token.balanceOf(address(this)).sub(_totalLockedAmount);
    }

    // Funds which always have to be holded in accountant smart contract.
    function minimalExpectedBalance() public view returns (uint256) {
        return max(stake, punishment.amount).add(lockedFunds); 
        // return max(lockedFunds, totalLoan).add(max(stake, punishment.amount))
    }

    // TODO add loan return logic
    function closeAccountant() public onlyOperator {
        require(isAccountantActive(), "accountant should be active");
        status = Status.Closed;
        emit AccountantClosed(block.number);
    }

    // Returns blocknumber until which exit request should be locked
    function getTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function getEmergencyTimelock() internal view returns (uint256) {
        return block.number + DELAY_BLOCKS * 10; // +/- 30 days
    }

    function max(uint a, uint b) private pure returns (uint) {
        return a > b ? a : b;
    }

    function min(uint a, uint b) private pure returns (uint) {
        return a < b ? a : b;
    }

    function round(uint a, uint m) private pure returns (uint ) {
        return ((a + m - 1) / m) * m;
    }

    // Setting new destination of funds recovery.
    function setFundsDestination(address payable _newDestination) public onlyOperator {
        require(_newDestination != address(0));
        emit DestinationChanged(fundsDestination, _newDestination);
        fundsDestination = _newDestination;
    }

}
