Changelog
=========

Here I'm collecting changes (with motivatinos) made during last refactoring.

- Did refactoring for `registerIdentity`. 
    * Now user hermes where possible without breaking external APIs. --> I'll try to avoid redeployment of Registry at this stage. So these changes will become active only after testnet deployment on ethereum mainnet.
    * Hermes channel will be opened only if stakeAmount and beneficiary are provided. --> We don't need opening hermes channels for every consumer. Now Hermes channels can be opened during first promise settlement.
- 






Questions
---------

? What if same registration will be done twice? (e.g. with different beneficiary). Add tests for that.
? How about Hermes contract versionings? Can we support more versions of hermes contracts? Of payment channels?
? 