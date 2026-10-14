# Grant failure investigation — Arc testnet, 14 October 2026

These are historical failed/diagnostic runs, not the final passing browser evidence. The final run is
`../ROUND2-BROWSER-TESTNET.json` with funding/sweep accounting in `../ROUND2-BROWSER-RUN.json`.

- `ROUND2-*`: the lead's original uncommitted failure artifacts, preserved verbatim.
- `REPRO-*`, `permission-failed.png`: reproduction with the original app; UI reports a failed exact canonical proof.
- `APPROVAL-RECEIPTS.json`: the reproduction's successful USDC approval, read back from the public testnet.
- `DIAGNOSTIC-*`: saved call compared with its mined transaction; all call fields match. No private key or signed request is stored.
- `RECOVERY-BROWSER.json`: a later read-only browser recovery succeeds without signing again. Its unrelated route checks exposed missing DOM expansion/selection attributes: React Native Web 0.21 ignores native accessibilityState. Press now maps these to individual ARIA props; assertions wait for committed state.
- `BLOCK-RACE-*`, `block-race.png`: decisive evidence. For transaction `0x4d5b05d9af03979cdaa2aa90a587c7bcd9aeb77914f79e327e9fbc495145eb70`, the receipt is successful in block `0x400ec3a`, while concurrent transaction lookup still returns null block hash/number. The app stopped before grant.
- `FIRST-FIXED-*`, `gas-reservation-limit.png`: grant, two buys, over-cap refusal and first sell succeeded after the fix. Optional second sell hit the conservative executor gas reservation after a 0.099369 USDC pool donation. The final rehearsal uses a 0.05 USDC cap, one 0.04 buy and one sell-back to fit the task budget.
- `RECOVERY-SWEEP.json`: remaining xWETH from that partial run transferred to the deployer; unused owner USDC swept back.

Fix: poll transaction lookup only while inclusion metadata is null, then enforce the original sender, target, calldata hash,
value, gas, nonce, fee caps, receipt block hash/number, finalized height and canonical block. No automatic resubmission.

`FLOW-PASS-ARIA-FAIL-*` records a complete successful trading flow, including both Memo events and both refusals, with three desktop ARIA failures. The web export was rebuilt during the subsequent read-only page checks, so mobile checks passed with the ARIA fix. This mixed-build diagnostic is not the final acceptance run.

`previous-home-end-1440.png` belongs to the earlier diagnostic run. The final Home page did not need an end-of-scroll capture; this image is kept outside the current screenshot directory.
