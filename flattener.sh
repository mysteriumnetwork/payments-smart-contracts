#!/bin/sh

truffle-flattener ./contracts/AccountantImplementation.sol --output ./contracts/flattened/AccountantImplementation.sol.flattened
truffle-flattener ./contracts/ChannelImplementation.sol --output ./contracts/flattened/ChannelImplementation.sol.flattened
truffle-flattener ./contracts/MystDEX.sol --output ./contracts/flattened/DEXImplementation.sol.flattened
truffle-flattener ./contracts/Registry.sol --output ./contracts/flattened/Registry.sol.flattened

echo "DONE"
echo "Flattened files are saved into contracts/flattened/ directory"