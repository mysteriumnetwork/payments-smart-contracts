# Identity registration flow

Technical flow how `node` and `transactor` services have to communicate to accomplish identity registration.

   1. node requests registration txFee with /fee/registration call
   1. node issues request to /identity/register with (params=[registryAddress, accountantID, stake, txFee, beneficiary(if stake>0) ], sig[params]) through Transactor
        1. Transactor extracts identity from sig 
        1. Transactor checks if identity is not already registered
        1. Transactor calculates channel address
        1. Transactor starts watching BC (MYST token SC) for incoming tx to channel address
            - when tx is mined Transactor calls registerIdentity on BC SCs (Transactor receives txFee)
   1. Transactor returns channel address to node
        1. show channel address to pay to on UI
        1. show identity registerFee is shown on UI
        1. user (node owner) transfers tokens (min txFee + registerFee amount) to given channel address
        1. node checks if identity is already registered (/identities/current ) and shows status on UI

## Promote identity registration to provider

   1. node requests Accountant for promotion to provider sending (params=[identity, beneficiary(or channelID), stake], sig[params] )
   1. Accountant calls BC through Transactor to register incoming channel for given identity
   1. Accountant returns incoming channelID (to receive money) to the node
