#!/bin/sh
# Rehearse XORR on a local fork of Arc — Circle's real USDC/EURC/WETH/cirBTC, Chainlink's real Arc feeds, Uniswap's real
# v3 pools, the real ERC-8004 registries and CCIP router — without spending a cent.
#
#   ARC_FOUNDRY=/path/to/arc-foundry sh scripts/arc-fork.sh [mainnet|testnet]   # default mainnet
#   sh scripts/arc-fork.sh stop
#
# Needs Circle's Arc Foundry (arc-anvil executes Arc's native-USDC precompile). Ports: 9110 (mainnet fork), 9111 (testnet
# fork); override with ARC_FORK_PORT. Fresh keys are generated into .fork/ (git-ignored) — never anvil's public dev keys,
# which Arc's USDC blocklists — and funded with fork USDC by setting their native balance (the same USDC as 0x3600…).
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
NET=${1:-mainnet}
AF=${ARC_FOUNDRY:-}
ANVIL=${AF:+$AF/}anvil; FORGE=${AF:+$AF/}forge; CAST=${AF:+$AF/}cast
mkdir -p .fork
if [ "$NET" = stop ]; then
  for f in .fork/*.pid; do [ -f "$f" ] && kill "$(cat "$f")" 2>/dev/null; rm -f "$f"; done; echo stopped; exit 0
fi
if [ "$NET" = mainnet ]; then PORT=${ARC_FORK_PORT:-9110}; UP=${ARC_MAINNET_RPC_URL:-https://rpc.mainnet.arc.io}
else PORT=${ARC_FORK_PORT:-9111}; UP=${ARC_TESTNET_RPC_URL:-https://rpc.testnet.arc.io}; fi
RPC=http://127.0.0.1:$PORT
if ! $CAST chain-id --rpc-url $RPC >/dev/null 2>&1; then
  # Pinned fork block (cached by anvil), auto-mining, and a gentle request rate: the public Arc RPC rate-limits.
  BLOCK=${ARC_FORK_BLOCK:-$(( $($CAST block-number --rpc-url "$UP") - 2 ))}
  nohup "$ANVIL" --network arc --fork-url "$UP" --fork-block-number "$BLOCK" --port "$PORT" \
    --compute-units-per-second 40 --fork-retry-backoff 2000 --retries 8 --silent > ".fork/$NET.log" 2>&1 &
  echo $! > ".fork/$NET.pid"
  i=0; until $CAST chain-id --rpc-url $RPC >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 90 ] && { echo "fork did not start: .fork/$NET.log"; exit 1; }; sleep 1; done
fi
# Fresh fork-only keys: deployer, executor (agent + council recorder + keeper), and a demo owner.
if [ ! -f .fork/keys.env ]; then
  {
    echo "FORK_DEPLOYER_KEY=$($CAST wallet new --json | sed -n 's/.*"private_key": *"\([^"]*\)".*/\1/p')"
    echo "FORK_EXECUTOR_KEY=$($CAST wallet new --json | sed -n 's/.*"private_key": *"\([^"]*\)".*/\1/p')"
    echo "FORK_OWNER_KEY=$($CAST wallet new --json | sed -n 's/.*"private_key": *"\([^"]*\)".*/\1/p')"
  } > .fork/keys.env
  chmod 600 .fork/keys.env
fi
set -a; . ./.fork/keys.env; set +a
for k in "$FORK_DEPLOYER_KEY" "$FORK_EXECUTOR_KEY" "$FORK_OWNER_KEY"; do
  $CAST rpc anvil_setBalance "$($CAST wallet address --private-key "$k")" 0x3635c9adc5dea00000 --rpc-url $RPC >/dev/null # 1,000 USDC
done
EXEC=$($CAST wallet address --private-key "$FORK_EXECUTOR_KEY")
OUT="$ROOT/.fork/arc-$NET-fork.json"
# Testnet fork: mirror today's mainnet Chainlink answers into the testnet mirror feeds.
if [ "$NET" = testnet ]; then
  eval "$(sh scripts/mainnet-prices.sh)"
fi
# The fork shares its chain id with the real network, so keep forge's broadcast records of it apart.
(cd contracts && DEPLOYER_PRIVATE_KEY="$FORK_DEPLOYER_KEY" XORR_EXECUTOR="$EXEC" DEPLOYMENT_OUT="$OUT" \
  "$FORGE" script script/Deploy.s.sol --rpc-url $RPC --broadcast --slow --skip-simulation 2>&1 \
  | grep -E "XORR|delegation|Error|error|No testnet" || true)
rm -rf contracts/broadcast/Deploy.s.sol/5042 2>/dev/null || true
[ "$NET" = testnet ] && rm -rf contracts/broadcast/Deploy.s.sol/5042002 2>/dev/null || true
[ -f "$OUT" ] && echo "fork ready on $RPC — addresses in $OUT"
