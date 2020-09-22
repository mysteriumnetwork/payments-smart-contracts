#!/bin/sh

truffle-flattener ./contracts/MystToken.sol --output ./contracts/flattened/MystToken.sol.flattened
truffle-flattener ./contracts/HermesImplementation.sol --output ./contracts/flattened/HermesImplementation.sol.flattened
truffle-flattener ./contracts/ChannelImplementation.sol --output ./contracts/flattened/ChannelImplementation.sol.flattened
truffle-flattener ./contracts/Registry.sol --output ./contracts/flattened/Registry.sol.flattened

echo "DONE"
echo "Flattened files are saved into contracts/flattened/ directory"