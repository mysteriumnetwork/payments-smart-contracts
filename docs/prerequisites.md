Prerequisites
===============

Own token:
- We should use our own MYST token
- We would like to avoid MYST migration into another standard or platform

Highly scalable:
- We would like to be able to have hundreds of thousands token transfers per second (of-chain)
- Amount of one transaction can be very small (less than one cent)
- It should be fairly cheap (max 10%) to settle into main chain relatively small amounts (e.g. 5 USD in tokens) of total balance (payments received from different providers)

Secure:
- Our identities have to be registered and should pay fee or stake some tokens
- We would like to avoid double spend problems
- System should be secured against different kind of attacks (e.g. DDos)

Product:
- Systems have to be fully decentralised, so no entity should be in control
- There will be potentially much more consumers than providers
- Provider's weekly income will be received from different consumers
- Income from one consumer can be very small (less than dollar) but because of big amount of consumers, total income can be 5-100 USD / week per node
- Ideally system should support different type of pricing (pay as you go, subscription …)

Amount of work
- Implementation of MVP (not prototype) of system should take not more that 1-3 months

Usability
- User should be able popup his balance from any wallet or exchange
- User should be able to use platform without need of having ethers
- Ideally user should be able to topup given address via ethers which are automatically converted into MYST
