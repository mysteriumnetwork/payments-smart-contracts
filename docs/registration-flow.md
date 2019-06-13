# Payments

**Deploy SCs to Ropsten (testnet)**
 - update readme with contract addresses

**Register identity flow**
   1. node issues request to registerIdentity through Transactor
   1. node requests for invoice transaction
   1. receives invoice from Transactor for trans fee and amount needed to register identity
   1. node derives channel address from own identity
   1. node creates exchangeMessage to Transactor for the registration (with MYSTs)
   1. node calls Transactor /registerIdentity endpoint with (identity, exchangeMessage)
        1. Transactor validates exchangeMessage
        1. Transactor calculates channel address
        1. Transactor starts watching BC (MYST token SC) for incoming tx to channel address
            - when tx is mined Transactor calls registerIdentity on BC SCs
   1. Transactor returns channel address to node
        1. show channel address to pay to on UI
        1. user transfers tokens to given channel address
        1. node checks if identity is already registered and shows status on UI
   1. Transactor sends exchangeMessage to Accountant and gets promise back

**Promote identity registration to provider**
   1. node requests Accountant to be promoted to provider sending (identity, beneficiary (optional) )
   1. Accountant calls BC through Transactor to register incoming channel for given identity
   1. Accountant returns incoming (to receive money) channel address to node
