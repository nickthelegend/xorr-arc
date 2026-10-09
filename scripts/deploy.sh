#!/bin/sh
# Deploy XORR to Arc. The network is the chain the RPC answers for (5042 mainnet, 5042002 testnet).
#
#   DEPLOYER_ENV=path/to/file-with-DEPLOYER_PRIVATE_KEY XORR_EXECUTOR=0x<executor address> \
#     sh scripts/deploy.sh mainnet|testnet
#
# Optional: ARC_FOUNDRY=<dir with Circle's forge/cast> (recommended on a real network), VERIFY=1 to verify every contract
# on Blockscout, DEPLOY_LOCK=<dir> to serialise broadcasts when several projects share one deployer wallet,
# DAILY_CAP_CEILING (USDC units; default in the script). Writes deployments/arc-<network>.json. The private key is read
# from the env file inside this process and never printed.
set -e
cd "$(dirname "$0")/.."
ROOT=$(pwd)
NET=${1:?usage: sh scripts/deploy.sh mainnet|testnet}
: "${XORR_EXECUTOR:?set XORR_EXECUTOR to the executor address (council recorder and the agent users grant)}"
: "${DEPLOYER_ENV:?set DEPLOYER_ENV to a file that defines DEPLOYER_PRIVATE_KEY}"
case "$NET" in
  mainnet) RPC=${ARC_RPC_URL:-https://rpc.mainnet.arc.io}; CHAIN=5042; EXPLORER=https://explorer.arc.io ;;
  testnet) RPC=${ARC_RPC_URL:-https://rpc.testnet.arc.io}; CHAIN=5042002; EXPLORER=https://explorer.testnet.arc.io ;;
  *) echo "network must be mainnet or testnet"; exit 1 ;;
esac
FORGE=${ARC_FOUNDRY:+$ARC_FOUNDRY/}forge
CAST=${ARC_FOUNDRY:+$ARC_FOUNDRY/}cast
[ "$($CAST chain-id --rpc-url "$RPC")" = "$CHAIN" ] || { echo "$RPC is not chain $CHAIN"; exit 1; }
[ "$NET" = testnet ] && eval "$(sh scripts/mainnet-prices.sh)" && export MIRROR_ETH MIRROR_BTC MIRROR_EURC MIRROR_USDC MIRROR_AT
VERIFY_ARGS=""
[ -n "$VERIFY" ] && VERIFY_ARGS="--verify --verifier blockscout --verifier-url $EXPLORER/api/"
(cd contracts && $FORGE build)
if [ -n "$DEPLOY_LOCK" ]; then until mkdir "$DEPLOY_LOCK" 2>/dev/null; do sleep 3; done; trap 'rmdir "$DEPLOY_LOCK"' EXIT; fi
set -a; . "$DEPLOYER_ENV"; set +a
(cd contracts && DEPLOYER_PRIVATE_KEY="$DEPLOYER_PRIVATE_KEY" $FORGE script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --slow $VERIFY_ARGS)
echo "deployed: $ROOT/deployments/arc-$NET.json"
