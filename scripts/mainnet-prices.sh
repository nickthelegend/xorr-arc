#!/bin/sh
# Print MIRROR_* env lines with Chainlink's current answers on Arc MAINNET (for the testnet mirror feeds).
CAST=${ARC_FOUNDRY:+$ARC_FOUNDRY/}cast
R=${ARC_MAINNET_RPC_URL:-https://rpc.mainnet.arc.io}
read_feed() { "$CAST" call "$1" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' -r "$R" | sed -n "$2p" | awk '{print $1}'; }
echo "MIRROR_ETH=$(read_feed 0x50FCDD99D6762D1C170DC6A9111db944AEE6D364 2)"; sleep 1
echo "MIRROR_BTC=$(read_feed 0xa109B535C70C8Be9995be64Bb6751AcDB27e03De 2)"; sleep 1
echo "MIRROR_EURC=$(read_feed 0x361b95c10b76Ca3f35C686d423e43A951755Bf23 2)"; sleep 1
echo "MIRROR_USDC=$(read_feed 0x84EA90AC252Dc437031461836DB5164219147905 2)"; sleep 1
echo "MIRROR_AT=$(read_feed 0x84EA90AC252Dc437031461836DB5164219147905 4)"
