Changelog
=========

Here I'm collecting changes (with motivatinos) made during last refactoring.

- Did refactoring for `registerIdentity`.
    * Now user hermes where possible without breaking external APIs. --> I'll try to avoid redeployment of Registry at this stage. So these changes will become active only after testnet deployment on ethereum mainnet.
    * Hermes channel will be opened only if stakeAmount and beneficiary are provided. --> We don't need opening hermes channels for every consumer. Now Hermes channels can be opened during first promise settlement.
- Added channel opening during promise settlement.
- Renamed loan to stake.
- Settlement will increase stake if `channel.stake < minStake`.
- Added notion of `minStake` into hermes contract. During hermes registration 1 MYSTT will be used as default `minStake` value.
- There is new function `settleIntoStake` which will use all not settled promise amount as stake increase.
- Hermes operator can set new `minStake` value.






Questions
---------

? What if same registration will be done twice? (e.g. with different beneficiary). Add tests for that.
? How about Hermes contract versionings? Can we support more versions of hermes contracts? Of payment channels?
? Is is possible easily to increase stake until wanted amount without promise? E.g. same identity as consumer could issue promise as provider? Or app could provide payload to call needed function which will update stake and take tokens from msg.sender.
? We don't actually need to pass identity into `settlePromise` functions, it is already in `_signature`. But maybe it is valuable for debugging purpose?
