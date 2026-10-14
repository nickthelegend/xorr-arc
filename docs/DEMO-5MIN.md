LEAD: RUN THESE
- `node scripts/e2e-browser-video-5min.mjs` (from this repo in the shared Arc workspace)
- `node ../video/scripts/render-5min-A.mjs xorr-5min`

Five-minute mainnet demo: `../video/out/xorr-5min.mp4`, timeline JSON, narration JSON and REVIEW beside it.
300 seconds, 1920×1080, 30 fps; 667 narration words supplied as text. No voice generated.
Post-render check: 14 successful receipts, 2 intentional failures; exact fees verified.
Hosted page and explorer browser checks passed. Receipt proof: [DEMO-5MIN-RECEIPTS.json](DEMO-5MIN-RECEIPTS.json).
- Hosted UI forwards to local executor, real mainnet contracts.
- Agent close vetoed by price guard; owner recovered directly.
- Two expected mined reverts; remaining receipts successful.
- No voice generated; captions and original instrumental only.
Mainnet status label corrected in 15395a0; typecheck passed and Vercel production deployed.
Existing browser-audit refresh was preserved separately, including its original hosting errors.
