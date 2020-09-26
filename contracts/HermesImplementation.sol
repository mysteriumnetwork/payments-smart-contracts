// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.7.1;

import { ECDSA } from "@openzeppelin/contracts/cryptography/ECDSA.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IUniswapV2Router } from "./interfaces/IUniswapV2Router.sol";
import { IERC20Token } from "./interfaces/IERC20Token.sol";
import { FundsRecovery } from "./FundsRecovery.sol";

interface IdentityRegistry {
    function isRegistered(address _identity) external view returns (bool);
    function minimalHermesStake() external view returns (uint256);
    function getChannelAddress(address _identity, address _hermesId) external view returns (address);
}


// Uni-directional settle based hermes
contract HermesImplementation is FundsRecovery {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    string constant STAKE_RETURN_PREFIX = "Stake return request";
    string constant STAKE_GOAL_UPDATE_PREFIX = "Stake goal update request";
    uint256 constant DELAY_BLOCKS = 18000;  // +/- 3 days
    uint256 constant UNIT_BLOCKS = 257;     // 1 unit = 1 hour = 257 blocks.

    IdentityRegistry internal registry;
    address internal operator;
    uint256 internal lockedFunds;              // funds locked in channels
    uint256 internal totalStake;               // total amount staked by providers
    uint256 internal minStake;                 // minimal possible provider's stake (channel opening during promise settlement will use it)
    uint256 internal maxStake;                 // maximal allowed provider's stake
    uint256 internal hermesStake;              // hermes stake is used to prove hermes' sustainability
    uint256 internal closingTimelock;          // blocknumber after which getting stake back will become possible
    IUniswapV2Router internal dex;             // any uniswap v2 compatible dex router address

    enum Status { Active, Paused, Punishment, Closed } // hermes states
    Status internal status;

    struct HermesFee {
        uint16 value;                      // subprocent amount. e.g. 2.5% = 250
        uint64 validFrom;                  // block from which fee is valid
    }
    HermesFee public lastFee;          // default fee to look for
    HermesFee public previousFee;      // previous fee is used if last fee is still not active

    struct Channel {
        address beneficiary;        // address where funds will be send
        uint256 balance;            // amount available to settle
        uint256 settled;            // total amount already settled by provider
        uint256 stake;              // amount staked by identity to guarante channel size
        uint256 stakeGoal;          // any stake between minStake and maxStake
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

    function getChannelId(address _identity) public view returns (bytes32) {
        return keccak256(abi.encodePacked(_identity, address(this)));
    }

    function getRegistry() public view returns (address) {
        return address(registry);
    }

    function getHermesStake() public view returns (uint256) {
        return hermesStake;
    }

    function getStakeThresholds() public view returns (uint256, uint256) {
        return (minStake, maxStake);
    }

    // Returns hermes state
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
    event NewStake(bytes32 indexed channelId, uint256 stakeAmount);
    event MinStakeValueUpdated(uint256 newMinStake);
    event MaxStakeValueUpdated(uint256 newMaxStake);
    event StakeGoalUpdated(bytes32 indexed channelId, uint256 newStakeGoal);
    event PromiseSettled(bytes32 indexed channelId, address indexed beneficiary, uint256 sentToBeneficiary, uint256 fees, uint256 stakeInsceseAmount);
    event ChannelBeneficiaryChanged(bytes32 channelId, address newBeneficiary);
    event HermesFeeUpdated(uint16 newFee, uint64 validFromBlock);
    event HermesClosed(uint256 blockNumber);
    event ChannelOpeningPaused();
    event ChannelOpeningActivated();
    event FundsWithdrawned(uint256 amount, address beneficiary);
    event HermesStakeIncreased(uint256 newStake);
    event HermesPunishmentActivated(uint256 activationBlock);
    event HermesPunishmentDeactivated();
    event NewHermesOperator(address newOperator);

    modifier onlyOperator() {
        require(msg.sender == operator, "only operator can call this function");
        _;
    }

    /*
      ------------------------------------------- SETUP -------------------------------------------
    */

    // Because of proxy pattern this function is used insted of constructor.
    // Have to be called right after proxy deployment.
    function initialize(address _token, address _operator, uint16 _fee, uint256 _minStake, uint256 _maxStake, address payable _dexAddress) public virtual {
        require(!isInitialized(), "have to be not initialized");
        require(_operator != address(0), "operator have to be set");
        require(_token != address(0), "token can't be deployd into zero address");
        require(_fee <= 5000, "fee can't be bigger than 50%");
        require(_maxStake > _minStake, "maxStake have to be bigger than minStake");

        token = IERC20Token(_token);
        registry = IdentityRegistry(msg.sender);
        operator = _operator;
        lastFee = HermesFee(_fee, uint64(block.number));
        minStake = _minStake;
        maxStake = _maxStake;
        hermesStake = token.balanceOf(address(this));

        dex = IUniswapV2Router(_dexAddress);
        token.approve(_dexAddress, uint(-1)); // MYST token's transfer from is cheaper when there is approval of uint(-1)
    }

    function isInitialized() public view returns (bool) {
        return operator != address(0);
    }

    /*
      -------------------------------------- MAIN FUNCTIONALITY -----------------------------------
    */

    // Open incoming payments (also known as provider) channel. Can be called only by Registry.
    function openChannel(address _identity, address _beneficiary, uint256 _amountToLend) public {
        require(msg.sender == address(registry), "only registry can open channels");
        require(getStatus() == Status.Active, "hermes have to be in active state");
        bytes32 _channelId = getChannelId(_identity);
        _openChannel(_channelId, _beneficiary, _amountToLend);
    }

    // Open incoming payments (also known as provider) channel.
    function _openChannel(bytes32 _channelId, address _beneficiary, uint256 _amountToStake) internal {
        require(!isChannelOpened(_channelId), "channel have to be not opened yet");

        // During opening new channel user can stake some funds to be guaranteed on channels size
        if (_amountToStake > 0) {
            _increaseStake(_channelId, _amountToStake, false);
        }

        Channel storage _channel = channels[_channelId];
        _channel.beneficiary = _beneficiary;
        _channel.balance = _amountToStake;
        _channel.stakeGoal = minStake;

        emit ChannelOpened(_channelId, _amountToStake);
    }

    // Settle promise
    // _lock is random number generated by receiver used in HTLC
    function _settlePromise(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature, bool _withDEX) internal {
        Channel storage _channel = channels[_channelId];

        bytes32 _hashlock = keccak256(abi.encodePacked(_lock));
        address _signer = keccak256(abi.encodePacked(_channelId, _amount, _transactorFee, _hashlock)).recover(_signature);
        require(_signer == operator, "have to be signed by operator");

        // Calculate amount of tokens to be claimed.
        uint256 _unpaidAmount = _amount.sub(_channel.settled);
        require(_unpaidAmount > 0, "amount to settle should be greater that already settled");
        require(_transactorFee <= _unpaidAmount, "transactor fee should be equal to or less than _unpaidAmount");

        // Hermes is allowing to settle at least minStake amount when there is not enough stake collected.
        // If promise has more tokens than in balance, we can transfer as much as there are in balance and
        // rest tokens can be transferred via same promise but in another tx when channel will be rebalanced.
        uint256 _currentBalance = (_channel.stake >= _channel.stakeGoal) ? _channel.balance : _channel.stakeGoal;
        if (_unpaidAmount > _currentBalance) {
            _unpaidAmount = _currentBalance;
        }

        // Increase already paid amount.
        _channel.settled = _channel.settled.add(_unpaidAmount);

        // Calculate hermes fee.
        uint256 _hermesFee = calculateHermesFee(_unpaidAmount);

        // Update channel balance and increase stake if min stake not reached yet.
        uint256 _fees = _transactorFee.add(_hermesFee);
        uint256 _amountToSettle = _unpaidAmount.sub(_fees);
        uint256 _stakeIncrease;
        if (_channel.stake < _channel.stakeGoal) {
            // Calculate stake increase duties by adding 10% of _amountToSettle there, but new stake can't increase maxStake.
            _stakeIncrease = min(_amountToSettle / 10, maxStake.sub(_channel.stake));

            _increaseStake(_channelId, _stakeIncrease, true);
            _amountToSettle = _amountToSettle.sub(_stakeIncrease);
        }

        // Decrease hermes locked funds.
        lockedFunds = lockedFunds.sub(min(_unpaidAmount, _channel.balance));

        // Transfer tokens or exchange them into ETH via uniswap (or compatible dex)
        if (_withDEX) {
            uint amountOutMin = 0;
            address[] memory path = new address[](2);
            path[0] = address(token);
            path[1] = dex.WETH();

            dex.swapExactTokensForETH(_amountToSettle, amountOutMin, path, _channel.beneficiary, block.timestamp);
        } else {
            token.transfer(_channel.beneficiary, _amountToSettle);
        }

        // Update channel balance
        _channel.balance = _channel.balance.sub(min(_unpaidAmount, _channel.balance));

        // Pay fee
        if (_transactorFee > 0) {
            token.transfer(msg.sender, _transactorFee);
        }

        emit PromiseSettled(_channelId, _channel.beneficiary, _amountToSettle, _fees, _stakeIncrease);
    }

    function settlePromise(address _identity, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_identity);

        // If channel isn't opened yet, open it
        if (!isChannelOpened(_channelId)) {
            address _beneficiary = registry.getChannelAddress(_identity, address(this));
            _openChannel(_channelId, _beneficiary, 0);
        }

        _settlePromise(_channelId, _amount, _transactorFee, _lock, _signature, false);
    }

    function settleAndRebalance(address _identity, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_identity);

        // If channel isn't opened yet, open it
        if (!isChannelOpened(_channelId)) {
            address _beneficiary = registry.getChannelAddress(_identity, address(this));
            _openChannel(_channelId, _beneficiary, 0);
        }

        _settlePromise(_channelId, _amount, _transactorFee, _lock, _signature, false);
        rebalanceChannel(_channelId);
    }

    function settleWithBeneficiary(address _identity, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _promiseSignature, address _newBeneficiary, bytes memory _signature) public {
        bytes32 _channelId = getChannelId(_identity);

        // If channel isn't opened yet, open it
        if (!isChannelOpened(_channelId)) {
            _openChannel(_channelId, _newBeneficiary, 0);
        }

        setBeneficiary(_channelId, _newBeneficiary, _signature);
        _settlePromise(_channelId, _amount, _transactorFee, _lock, _promiseSignature, false);
        rebalanceChannel(_channelId);
    }

    function settleWithGoalIncrease(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _promiseSignature, uint256 _newStakeGoal, bytes memory _goalChangeSignature) public {
        updateStakeGoal(_channelId, _newStakeGoal, _goalChangeSignature);
        _settlePromise(_channelId, _amount, _transactorFee, _lock, _promiseSignature, false);
    }

    function settleWithDEX(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature) public {
        _settlePromise(_channelId, _amount, _transactorFee, _lock, _signature, true);
        rebalanceChannel(_channelId);
    }

    // Hermes can update channel balance by himself. He can update into any amount size
    // but not less that provider's stake amount.
    function updateChannelBalance(bytes32 _channelId, uint256 _newBalance) public onlyOperator {
        require(isHermesActive(), "hermes has to be active");
        require(isChannelOpened(_channelId), "channel has to be opened");
        require(_newBalance >= channels[_channelId].stake, "balance can't be less than stake amount");

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

    // Possibility to increase channel balance without operator's signature (up to staked amount)
    function rebalanceChannel(bytes32 _channelId) public {
        require(isHermesActive(), "hermes have to be active");

        Channel storage _channel = channels[_channelId];
        require(_channel.stake > _channel.balance, "new balance should be bigger than current");

        uint256 _increaseAmount = _channel.stake.sub(_channel.balance);

        // If there are not enought funds to rebalance we have to enable punishment mode and rebalance into max possible amount.
        uint256 _minimalExpectedBalance = minimalExpectedBalance().add(_increaseAmount);
        uint256 _currentBalance = token.balanceOf(address(this));
        if (_currentBalance < _minimalExpectedBalance) {
            status = Status.Punishment;
            punishment.activationBlock = block.number;
            _increaseAmount = _minimalExpectedBalance.sub(_currentBalance);
            emit HermesPunishmentActivated(block.number);
        }

        lockedFunds = lockedFunds.add(_increaseAmount);
        _channel.balance = _channel.balance.add(_increaseAmount);

        emit ChannelBalanceUpdated(_channelId, _channel.balance);
    }

    // Hermes's available funds withdrawal. Can be done only if chanel is not closed and not in punishment mode.
    // Hermes can't withdraw stake, locked in channel funds and funds lended to him.
    function withdraw(address _beneficiary, uint256 _amount) public onlyOperator {
        require(isHermesActive(), "hermes have to be active");
        require(availableBalance() >= _amount, "should be enough funds available to withdraw");

        token.transfer(_beneficiary, _amount);

        emit FundsWithdrawned(_amount, _beneficiary);
    }

    /*
      -------------------------------------- STAKE MANAGEMENT --------------------------------------
    */

    function _increaseStake(bytes32 _channelId, uint256 _amountToAdd, bool _duringSettlement) internal {
        // NOTE: could if be simple if with return?
        require(_amountToAdd > 0, "should stake more than zero");

        Channel storage _channel = channels[_channelId];
        uint256 _newStakeAmount = _channel.stake.add(_amountToAdd);
        require(_newStakeAmount <= maxStake, "total amount to stake can't be bigger than maximally allowed");

        // We don't transfer tokens during settlements, they already locked in hermes contract.
        if (!_duringSettlement) {
            require(token.transferFrom(msg.sender, address(this), _amountToAdd), "token transfer should succeed");
        }

        _channel.stake = _newStakeAmount;
        lockedFunds = lockedFunds.add(_newStakeAmount.sub(_channel.balance));
        totalStake = totalStake.add(_amountToAdd);

        emit NewStake(_channelId, _newStakeAmount);
    }

    function settleIntoStake(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes32 _lock, bytes memory _signature) public {
        require(isChannelOpened(_channelId), "channel have to be opened");

        Channel storage _channel = channels[_channelId];
        bytes32 _hashlock = keccak256(abi.encodePacked(_lock));
        address _signer = keccak256(abi.encodePacked(_channelId, _amount, _transactorFee, _hashlock)).recover(_signature);
        require(_signer == operator, "have to be signed by operator");

        // Calculate amount of tokens to be claimed.
        uint256 _unpaidAmount = _amount.sub(_channel.settled);
        require(_transactorFee <= _unpaidAmount, "transactor fee should be equal to or less than _unpaidAmount");

        // Use all _unpaidAmount to increase channel stake.
        uint256 _stakeIncrease = _unpaidAmount.sub(_transactorFee);
        _increaseStake(_channelId, _stakeIncrease, true);

        // Increase already paid amount.
        _channel.settled = _channel.settled.add(_unpaidAmount);

        // Pay fee
        if (_transactorFee > 0) {
            token.transfer(msg.sender, _transactorFee);
        }

        emit PromiseSettled(_channelId, _channel.beneficiary, 0, _transactorFee, _stakeIncrease);

        // Rebalance channel with new state.
        rebalanceChannel(_channelId);
    }

    // Anyone can increase channel's capacity by staking more into hermes
    function increaseStake(bytes32 _channelId, uint256 _amount) public {
        require(isChannelOpened(_channelId), "channel has to be opened");
        require(getStatus() != Status.Closed, "hermes should be not closed");

        _increaseStake(_channelId, _amount, false);

        // Update channel balance so bigger promises would be already used
        Channel storage _channel = channels[_channelId];
        _channel.balance = _channel.stake;
        emit ChannelBalanceUpdated(_channelId, _channel.balance);
    }

    // Withdraw part of stake. This will also decrease channel balance.
    function decreaseStake(bytes32 _channelId, uint256 _amount, uint256 _transactorFee, bytes memory _signature) public {
        require(isChannelOpened(_channelId), "channel has to be opened");
        Channel storage _channel = channels[_channelId];

        _channel.lastUsedNonce = _channel.lastUsedNonce + 1;
        address _signer = keccak256(abi.encodePacked(STAKE_RETURN_PREFIX, _channelId, _amount, _transactorFee, _channel.lastUsedNonce)).recover(_signature);
        require(getChannelId(_signer) == _channelId, "have to be signed by channel party");

        require(_amount <= _channel.stake, "can't withdraw more than the current stake");
        require(_amount >= _transactorFee, "amount should be bigger than transactor fee");

        uint256 _channelBalanceDiff = min(_channel.balance, _amount);

        // Enable punishment mode when accountnant token amount after stake decrease if less than minimal expected.
        uint256 _minimalExpectedBalance = minimalExpectedBalance().sub(_channelBalanceDiff);
        uint256 _currentBalance = token.balanceOf(address(this));
        if (_amount > _currentBalance || _currentBalance.sub(_amount) < _minimalExpectedBalance) {
            if (isHermesActive()) {
                status = Status.Punishment;
                punishment.activationBlock = block.number;
                emit HermesPunishmentActivated(block.number);
            }
            _amount = _currentBalance.sub(_minimalExpectedBalance);
        }

        uint256 _newStakeAmount = _channel.stake.sub(_amount);
        require(_newStakeAmount <= maxStake, "amount to lend can't be bigger than maximum allowed");

        // Pay transacor fee then withdraw the rest
        if (_transactorFee > 0) {
            token.transfer(msg.sender, _transactorFee);
        }
        token.transfer(_channel.beneficiary, _amount.sub(_transactorFee));

        // Update channel state
        _channel.stake = _newStakeAmount;
        _channel.balance = _channel.balance.sub(_channelBalanceDiff);
        _channel.stakeGoal = minStake;     // By withdrawing part of stake, user is "renewing" aggreement with hermes.
        lockedFunds = lockedFunds.sub(_channelBalanceDiff);
        totalStake = totalStake.sub(_amount);

        emit ChannelBalanceUpdated(_channelId, _channel.balance);
        emit NewStake(_channelId, _newStakeAmount);
    }

    function updateStakeGoal(bytes32 _channelId, uint256 _newStakeGoal, bytes memory _signature) public {
        require(isChannelOpened(_channelId), "channel have to be opened");
        require(_newStakeGoal >= minStake, "stake goal can't be less than minimal stake");

        Channel storage _channel = channels[_channelId];

        _channel.lastUsedNonce = _channel.lastUsedNonce + 1;
        address _signer = keccak256(abi.encodePacked(STAKE_GOAL_UPDATE_PREFIX, _channelId, _newStakeGoal, _channel.lastUsedNonce)).recover(_signature);
        require(getChannelId(_signer) == _channelId, "have to be signed by channel party");

        _channel.stakeGoal = _newStakeGoal;

        emit StakeGoalUpdated(_channelId, _newStakeGoal);
    }

    /*
      ------------------------------------------ HELPERS ------------------------------------------
    */

    function resolveEmergency() public {
        require(getStatus() == Status.Punishment, "hermes should be in punishment status");

        // 0.04% of total channels amount per unit
        uint256 _punishmentPerUnit = round(lockedFunds.mul(4), 100).div(100);

        // No punishment during first unit.
        uint256 _unit = getUnitBlocks();
        uint256 _blocksPassed = block.number - punishment.activationBlock;
        uint256 _punishmentUnits = (round(_blocksPassed, _unit) / _unit).sub(1);

        uint256 _punishmentAmount = _punishmentUnits.mul(_punishmentPerUnit);
        punishment.amount = punishment.amount.add(_punishmentAmount);

        uint256 _shouldHave = max(lockedFunds, totalStake).add(max(hermesStake, punishment.amount));
        uint256 _currentBalance = token.balanceOf(address(this));
        uint256 _missingFunds = (_currentBalance < _shouldHave) ? _shouldHave.sub(_currentBalance) : uint256(0);

        // If there are not enough available funds, they have to be topuped from msg.sender.
        token.transferFrom(msg.sender, address(this), _missingFunds);

        // Disable punishment mode
        status = Status.Active;

        emit HermesPunishmentDeactivated();
    }

    function setBeneficiary(bytes32 _channelId, address _newBeneficiary, bytes memory _signature) public {
        require(isChannelOpened(_channelId), "channel has to be opened");
        require(_newBeneficiary != address(0), "beneficiary can't be zero address");
        Channel storage _channel = channels[_channelId];

        _channel.lastUsedNonce = _channel.lastUsedNonce + 1;
        address _signer = keccak256(abi.encodePacked(_channelId, _newBeneficiary, _channel.lastUsedNonce)).recover(_signature);
        require(getChannelId(_signer) == _channelId, "have to be signed by channel party");

        _channel.beneficiary = _newBeneficiary;

        emit ChannelBeneficiaryChanged(_channelId, _newBeneficiary);
    }

    function setHermesOperator(address _newOperator) public onlyOperator {
        require(_newOperator != address(0), "can't be zero address");
        operator = _newOperator;
        emit NewHermesOperator(_newOperator);
    }

    function setMaxStake(uint256 _newMaxStake) public onlyOperator {
        require(isHermesActive(), "hermes has to be active");
        require(_newMaxStake > minStake, "maxStake has to be bigger than minStake");
        maxStake = _newMaxStake;
        emit MaxStakeValueUpdated(_newMaxStake);
    }

    function setMinStake(uint256 _newMinStake) public onlyOperator {
        require(isHermesActive(), "hermes has to be active");
        require(_newMinStake < maxStake, "minStake has to be smaller than maxStake");
        minStake = _newMinStake;
        emit MinStakeValueUpdated(_newMinStake);
    }

    function setHermesFee(uint16 _newFee) public onlyOperator {
        require(getStatus() != Status.Closed, "hermes should be not closed");
        require(_newFee <= 5000, "fee can't be bigger that 50%");
        require(block.number >= lastFee.validFrom, "can't update inactive fee");

        // new fee will start be valid after delay block will pass
        uint64 _validFrom = uint64(getTimelock());

        previousFee = lastFee;
        lastFee = HermesFee(_newFee, _validFrom);

        emit HermesFeeUpdated(_newFee, _validFrom);
    }

    function calculateHermesFee(uint256 _amount) public view returns (uint256) {
        HermesFee memory _activeFee = (block.number >= lastFee.validFrom) ? lastFee : previousFee;
        return round((_amount * uint256(_activeFee.value) / 100), 100) / 100;
    }

    function increaseHermesStake(uint256 _additionalStake) public onlyOperator {
        if (availableBalance() < _additionalStake) {
            uint256 _diff = _additionalStake.sub(availableBalance());
            token.transferFrom(msg.sender, address(this), _diff);
        }

        hermesStake = hermesStake.add(_additionalStake);

        emit HermesStakeIncreased(hermesStake);
    }

    function isChannelOpened(bytes32 _channelId) public view returns (bool) {
        return channels[_channelId].beneficiary != address(0);
    }

    // If Hermes is not closed and is not in punishment mode, he is active.
    function isHermesActive() public view returns (bool) {
        Status _status = getStatus();
        return _status != Status.Punishment && _status != Status.Closed;
    }

    function pauseChannelOpening() public onlyOperator {
        require(getStatus() == Status.Active, "hermes have to be in active state");
        status = Status.Paused;
        emit ChannelOpeningPaused();
    }

    function activateChannelOpening() public onlyOperator {
        require(getStatus() == Status.Paused, "hermes have to be in paused state");
        status = Status.Active;
        emit ChannelOpeningActivated();
    }

    // Returns funds amount not locked in any channel, not staked and not lended from providers.
    function availableBalance() public view returns (uint256) {
        uint256 _totalLockedAmount = max(lockedFunds, totalStake).add(max(hermesStake, punishment.amount));
        if (_totalLockedAmount > token.balanceOf(address(this))) {
            return uint256(0);
        }
        return token.balanceOf(address(this)).sub(_totalLockedAmount);
    }

    // Funds which always have to be holded in hermes smart contract.
    function minimalExpectedBalance() public view returns (uint256) {
        return max(hermesStake, punishment.amount).add(lockedFunds);
    }

    function closeHermes() public onlyOperator {
        require(isHermesActive(), "hermes should be active");
        status = Status.Closed;
        closingTimelock = getEmergencyTimelock();
        emit HermesClosed(block.number);
    }

    function getStakeBack(address _beneficiary) public onlyOperator {
        require(getStatus() == Status.Closed, "hermes have to be closed");
        require(block.number > closingTimelock, "timelock period have be already passed");

        uint256 _amount = token.balanceOf(address(this)).sub(punishment.amount);
        token.transfer(_beneficiary, _amount);
    }

    function getUnitBlocks() internal pure virtual returns (uint256) {
        return UNIT_BLOCKS;
    }

    // Returns blocknumber until which exit request should be locked
    function getTimelock() internal view virtual returns (uint256) {
        return block.number + DELAY_BLOCKS;
    }

    function getEmergencyTimelock() internal view virtual returns (uint256) {
        return block.number + DELAY_BLOCKS * 100; // +/- 300 days
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
    function setFundsDestination(address payable _newDestination) public override onlyOperator {
        require(_newDestination != address(0));
        emit DestinationChanged(fundsDestination, _newDestination);
        fundsDestination = _newDestination;
    }

}
