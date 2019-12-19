#!/bin/sh

truffle-flattener ./contracts/AccountantImplementation.sol --output ./contracts/flattened/AccountantImplementation.sol.flattened
truffle-flattener ./contracts/AccountantImplementationProxy.sol --output ./contracts/flattened/AccountantImplementationProxy.sol.flattened
truffle-flattener ./contracts/ChannelImplementation.sol --output ./contracts/flattened/ChannelImplementation.sol.flattened
truffle-flattener ./contracts/ChannelIImplementationProxy.sol --output ./contracts/flattened/ChannelImplementationProxy.sol.flattened
truffle-flattener ./contracts/Config.sol --output ./contracts/flattened/Config.sol.flattened
truffle-flattener ./contracts/MystDEX.sol --output ./contracts/flattened/DEXImplementation.sol.flattened
truffle-flattener ./contracts/Registry.sol --output ./contracts/flattened/Registry.sol.flattened

echo "DONE"
echo "Flattened files are saved into contracts/flattened/ directory"