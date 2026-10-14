# Frontend port, 14 October 2026

Visual reference: the read-only `xorr-metropolis` checkout at `2bf6154` (screens inspected on 14 October).
No source-repository files were changed. A concurrent reset of xorr-arc's tracked files during this pass was isolated
by completing the work in a separate git worktree.

## Screen and component comparison

| Source surface | Arc surface | Data and adaptation |
|---|---|---|
| Home / agent sheet / round quick actions | `/` | Arc balance, permission and recorded rounds; Fund, Trade, Permission, History. Source agent orbs, setup strip and floating capsule. |
| Explore story tiles and expandable catalog | `/explore` | Source composition and copy structure, restricted to supported Arc routes. |
| Agent rooms | `/rooms` | Recorded council ballots grouped by desk. Rule-based reasons, no LLM composer or simulated chat. |
| Council bench, vote tally and replay | `/council`, `/round/[id]` | Arc signed round API, XorrCouncil and Memo receipts. Testnet offers xWETH, cent-sized trades. |
| History / Runs / speed receipts | `/history`, `/runs` | Confirmed fills or all recorded rounds; receipt-derived USDC fees and executor send-to-receipt time. |
| Delegate / permission | `/permission` | XorrDelegation remains authoritative; testnet caps 0.05/0.10/0.20 USDC, expiry, venue, slippage floor and revoke. |
| Fund / onboarding explanation | `/fund`, `/how` | Existing Circle funding layer, token balances, explicit Not run status for external funding routes. |
| Markets / agents / proof | `/markets`, `/agents`, `/arc`, `/treasury` | Existing Arc API and addresses retained. Shared source screen shell, fixed header and scroll region. |

The shared typography, fonts, brand assets, icons, Aurora, Rise, SheetCard, buttons and charts were compared directly.
Most were already identical; the current AgentOrb/loading primitive was copied. Brand assets and fonts matched byte-for-byte.
The source's 402px desktop column and violet/blue stage remain; mobile fills the device width without remounting the app.

Not ported: Perpl/GMX perps, Kuru, Mera/passkeys, stocks, other-chain strategies and the 313-strategy gauntlet.
The Arc API has no corresponding venue or research dataset. Showing those results as Arc activity would be misleading.
No historical returns, prices, conversations or market series were manufactured.

## Verification

- Root TypeScript: pass. Vitest: **191/191**, including two finalized-tag lag regressions.
- Server TypeScript build: pass (`npm --prefix server run build`).
- Expo web export: pass (ordinary build and opt-in localhost test signer build).
- Real browser flow: permission → council → 0.04 USDC xWETH buy → hold to revoke. See `UI-BROWSER-TESTNET.json` and `UI-OWNER-TRANSACTIONS.json`.
- Desktop 1280×900 and mobile 390×844 captures: `screens/testnet/*-{1280,390}.jpg`.
- Native iOS/Android runtime: **Not run**; the shared React Native components remain native-compatible, but this pass verified web.
- No mainnet broadcast; no contract deployment or ABI change.

The terminal sandbox prevented Playwright from launching Chromium (MachPort permission denied). The installed Chrome
browser connector's Playwright locators drove the exported app instead. `scripts/browser-wallet.mjs` is a loopback-only
EIP-1193 test signer: the existing owner key stays in Node, the browser receives only signatures/transaction hashes.
It accepts only the documented testnet contracts and limits, with a gas budget, and cannot sign arbitrary messages.
Enable it only for local testing with `EXPO_PUBLIC_TEST_WALLET=on`; it is absent from ordinary builds.
The production wallet integrations are unchanged except for a bounded wait for the RPC finalized tag to catch up with
a mined receipt. The original exact-call, canonical-block proof still gates completion; timeout retains recovery state.

The browser found two receipts reported as mined before the RPC finalized tag advanced. Both were recovered through
Home without another signature. The new bounded wait is covered by the regression tests. The keeper was off during
the capped rehearsal: feeds were the existing fresh testnet mirrors, and no settlement/autopilot transactions were sent.

Visual review was performed locally, without sub-agents, following the shared one-agent rule. The user-specified source
world takes precedence over generic style recommendations. Impeccable's detector reported no findings on the changed UI.
