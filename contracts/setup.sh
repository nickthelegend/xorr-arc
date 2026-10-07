#!/bin/sh
# Fetch the Solidity dependencies: npm packages (Chainlink, Uniswap v2 artifacts) and the two lib/ checkouts.
set -e
cd "$(dirname "$0")"
npm ci --no-audit --no-fund
mkdir -p lib
[ -d lib/forge-std ] || git clone -q --depth 1 --branch v1.16.2 https://github.com/foundry-rs/forge-std lib/forge-std
[ -d lib/openzeppelin-contracts ] || git clone -q --depth 1 --branch v5.7.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
echo "contracts deps ready"
