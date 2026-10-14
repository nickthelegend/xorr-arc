#!/usr/bin/env node
/** Exported Expo app + real Arc testnet. No keys, browser state or traces are written to disk. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createPublicClient, http, formatEther, decodeEventLog, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(import.meta.dirname, "..");
const api = "http://127.0.0.1:9120";
const origin = "http://127.0.0.1:9130";
const trade = process.argv.includes("--trade");
const recoveryCall = process.env.XORR_RECOVER_REPORT ? JSON.parse(readFileSync(resolve(root, process.env.XORR_RECOVER_REPORT), 'utf8')).pendingCalls[0] : null;
const key = /^OWNER_KEY=(0x[0-9a-fA-F]{64})/m.exec(
  readFileSync(
    resolve(
      root,
      process.env.OWNER_KEY_FILE ?? "../.deployer/xorr-testnet-owner.env",
    ),
    "utf8",
  ),
)?.[1];
if (!key) throw Error("Missing testnet owner key");
const owner = privateKeyToAccount(key).address;
const cfg = await fetch(`${api}/config`).then((r) => r.json());
if (
  cfg.chainId !== 5042002 ||
  cfg.fork ||
  cfg.deployment?.delegation.toLowerCase() !==
    "0x0cdb99a17ebe31d6179cef0963856fc06c7267f0"
)
  throw Error("Not the authorized live testnet deployment");
const pub = createPublicClient({ transport: http(cfg.rpcUrl) });
if ((await pub.getChainId()) !== 5042002) throw Error("RPC is not Arc testnet");
const before = await Promise.all(
  [owner, cfg.executor].map((address) => pub.getBalance({ address })),
);
const mimes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".json": "application/json",
};
const server = createServer((req, res) => {
  const path = resolve(
    root,
    "dist-web",
    "." + decodeURIComponent(new URL(req.url, origin).pathname),
  );
  if (
    !path.startsWith(resolve(root, "dist-web") + "/") &&
    path !== resolve(root, "dist-web")
  ) {
    res.writeHead(403);
    return res.end();
  }
  const file =
    existsSync(path) && extname(path)
      ? path
      : resolve(root, "dist-web/index.html");
  res.setHeader(
    "Content-Type",
    mimes[extname(file)] ?? "application/octet-stream",
  );
  res.end(readFileSync(file));
});
await new Promise((yes, no) => {
  server.once("error", no);
  server.listen(9130, "127.0.0.1", yes);
});
console.log(`static web pid ${process.pid}, port 9130`);
let browser;
try { browser = await chromium.launch({ headless: true }); }
catch (e) { await new Promise(r => server.close(r)); throw e; }
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
await context.addInitScript((k) => {
  localStorage.setItem("xorr.arc.deviceKey", k);
}, key);
if (recoveryCall) await context.addInitScript(p => localStorage.setItem(`arc:durable-call:v1:${p.chainId}:${p.from.toLowerCase()}`, JSON.stringify(p)), recoveryCall);
const page = await context.newPage();
const errors = [];
const rpcCalls = [];
const ownerHashes = [];
page.on('response', async response => {
  if (response.url().replace(/\/$/, '') !== cfg.rpcUrl.replace(/\/$/, '')) return;
  try {
    const request = response.request().postDataJSON();
    const body = await response.json();
    // Record methods and RPC errors only; never persist signed payloads or wallet storage.
    const proof = ['eth_getTransactionByHash', 'eth_getTransactionReceipt'].includes(request.method) && body.result ? Object.fromEntries(['hash','transactionHash','from','to','value','gas','nonce','maxFeePerGas','maxPriorityFeePerGas','blockHash','blockNumber','status'].filter(k => k in body.result).map(k => [k,body.result[k]])) : undefined;
    rpcCalls.push({method: request.method, status: response.status(), ...(body.error ? {error: body.error.message} : {}), ...(proof?{proof}:{})});
    if (['eth_sendRawTransaction', 'eth_sendTransaction'].includes(request.method) && typeof body.result === 'string') ownerHashes.push(body.result);
  } catch { /* a navigation can cancel a response */ }
});
let expectedOutage = false;
page.on('requestfailed', request => { if (!expectedOutage && !request.failure()?.errorText.includes('ERR_ABORTED')) errors.push(`Request failed: ${request.url()}`); });
page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(api)) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (!expectedOutage && msg.type() === "error") errors.push(msg.text());
});
const out = resolve(root, "docs/screens/testnet/round2");
mkdirSync(out, { recursive: true });
const result = {
  date: new Date().toISOString(),
  owner,
  executor: cfg.executor,
  chainId: cfg.chainId,
  trade,
  round2: true,
  transactions: [],
  screens: [],
  errors,
  rpcCalls,
  ownerHashes,
};
const account = () => fetch(`${api}/account/${owner}`).then((r) => r.json());
async function ready(route) {
  await page.goto(origin + route);
  await page
    .getByText("The executor is not reachable", { exact: true })
    .waitFor({ timeout: 200 })
    .catch(() => {});
  await page.waitForTimeout(1600);
}
async function until(fn, what) {
  for (let n = 0; n < 50; n++) {
    const error = page.getByTestId('permission-error');
    if (await error.count()) throw Error(`${what}: ${await error.innerText()}`);
    if (await fn()) return;
    await page.waitForTimeout(1000);
  }
  throw Error(`Timed out: ${what}`);
}
async function submitRound(step, side, amount) {
  await page.getByTestId(`side-${side}`).click();
  await page.getByTestId(`usd-${amount}`).click();
  const response = page.waitForResponse(r => r.url() === `${api}/rounds` && r.request().method() === 'POST', {timeout:120000});
  await page.getByTestId('convene').click();
  const payload = await (await response).json();
  if (!payload.round) throw Error(payload.error ?? `No ${step} round`);
  const round = payload.round;
  (result.followupRounds ??= []).push({step, round});
  if (round.record?.hash) result.transactions.push({step:`${step}-council`,hash:round.record.hash});
  if (round.trade?.hash) result.transactions.push({step,hash:round.trade.hash});
  for (const hash of round.maintenance?.hashes ?? []) result.transactions.push({step:'repeg',hash});
  await page.getByTestId('round-result').getByText(round.summary, {exact:true}).waitFor();
  return round;
}
async function expectRefused(step, reason) {
  const before = await account();
  const round = await submitRound(step, 'buy', 0.02);
  const after = await account();
  const risk = round.ballots.find(b => b.seat === 'risk-keeper');
  if (round.decision !== 'vetoed' || round.trade || risk?.vote !== 'veto' || !reason.test(risk.reason) || !round.record?.hash)
    throw Error(`${step} did not refuse and record the round: ${round.summary}`);
  if (JSON.stringify(before.balances) !== JSON.stringify(after.balances) || before.permission.spentToday !== after.permission.spentToday)
    throw Error(`${step} changed owner holdings or spend`);
  (result.refusals ??= []).push({step,reason:risk.reason,unchangedHoldings:true,spentToday:after.permission.spentToday});
  await page.getByTestId('round-result').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(out, `${step}-1440.png`)});
  console.log(`PASS ${step}: ${risk.reason}`);
}
try {
  if (recoveryCall) {
    await ready('/');
    await page.getByRole('button', {name:'Check the unconfirmed transaction', exact:true}).click();
    await page.waitForTimeout(5000);
    result.recoveryPage = await page.locator('body').innerText();
    result.recovered = await page.evaluate(() => !Object.keys(localStorage).some(k => k.startsWith('arc:durable-call:')));
    if (!result.recovered) throw Error(`Read-only recovery failed: ${result.recoveryPage}`);
    console.log('PASS read-only recovery of original approval; no new signature');
  }
  const cold = await browser.newContext({reducedMotion:'reduce'});
  try {
    const coldPage = await cold.newPage();
    for (const width of [1440,390]) {
      await coldPage.setViewportSize({width,height:900});
      await coldPage.goto(origin);
      await coldPage.getByTestId('connect-device').waitFor();
      await coldPage.screenshot({path:resolve(out,`cold-home-${width}.png`),fullPage:true});
      await coldPage.getByTestId('open-permission').click();
      await coldPage.getByText('Connect a wallet on the home screen first.',{exact:true}).waitFor();
      console.log(`PASS cold Home and permission navigation at ${width}`);
    }
  } finally { await cold.close(); }
  if (trade) {
    if (Number(formatEther(before[0])) < 0.15)
      throw Error(
        "Owner needs at least 0.15 USDC for capped browser rehearsal",
      );
    await ready("/permission");
    await page.getByTestId('cap-0.05').click();
    await page.getByTestId("grant").click();
    await until(async () => {
      const a = await account();
      return (
        a.permission.granted &&
        !a.permission.revoked &&
        !a.permission.stopped &&
        a.permission.dailyCap === 0.05
      );
    }, "grant");
    // Grant is followed by the optional guardian transaction. Do not navigate away mid-sequence.
    await until(async () => await page.getByTestId('grant').innerText() === 'Save the permission', 'grant sequence');
    console.log("PASS browser grant confirmed: 0.05 USDC/day, 1 day, 2% floor");
    const txs = await page
      .locator('[data-testid^="tx-"]')
      .evaluateAll((es) => es.map((e) => e.textContent));
    result.grantLinks = txs;
    await page.getByText('Now, on chain', {exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: resolve(out, "permission-granted-1440.png"),
    });
    await page.getByText('Signed and final on Arc', {exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:resolve(out, 'permission-receipts-1440.png')});
    await ready("/council");
    const response = page.waitForResponse(
      (r) => r.url() === `${api}/rounds` && r.request().method() === "POST",
      { timeout: 120000 },
    );
    await page.getByTestId("convene").click();
    const body = await (await response).json();
    if (!body.round) throw Error(body.error ?? "No round returned");
    result.round = body.round;
    const round = body.round;
    if (round.record?.hash)
      result.transactions.push({ step: "council", hash: round.record.hash });
    if (round.trade?.hash)
      result.transactions.push({ step: "trade", hash: round.trade.hash });
    await page.getByTestId("round-result").waitFor();
    await page.getByTestId('round-result').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(out, "council-result-1440.png") });
    console.log(
      `Browser council: ${round.summary}; trade ${round.trade?.hash ?? "not filled"}`,
    );
    if (round.trade?.hash) {
      await expectRefused('over-cap', /more than.*left of today's.*cap/);
      for (let n=0;n<1;n++) {
        const follow = await submitRound(`sell-${n+1}`, 'sell', 0.05);
        if (!follow.trade?.hash) throw Error(`Follow-up sell did not fill: ${follow.summary}`);
        console.log(`PASS browser sell https://explorer.testnet.arc.io/tx/${follow.trade.hash}`);
      }
    }
    for (const hash of round.maintenance?.hashes ?? []) result.transactions.push({step:'repeg',hash});
    // Revoke through the browser; the harness also revokes on any exception.
    await ready("/");
    const stop = page.getByTestId("hold-stop");
    await stop.scrollIntoViewIfNeeded();
    const box = await stop.boundingBox();
    if (!box) throw Error("Stop control is missing");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await until(async () => {
      const a = await account();
      return a.permission.stopped;
    }, "revoke");
    await page.getByText(/Stopped on Arc in/).first().waitFor();
    console.log("PASS browser hold-to-stop confirmed on chain");
    await page.waitForTimeout(500);
    result.revokeLinks = await page
      .locator('[data-testid^="tx-"]')
      .evaluateAll((es) => es.map((e) => e.textContent));
    await page.screenshot({ path: resolve(out, "home-revoked-1440.png") });
    await ready('/council');
    await expectRefused('post-revoke', /owner stopped the agents/i);
    if (!round.trade?.hash)
      throw Error(
        `Council did not fill: ${round.summary} ${round.trade?.error ?? ""}`,
      );
  }
  const rounds = await fetch(`${api}/rounds?owner=${owner}`).then((r) =>
    r.json(),
  );
  const latest = rounds.rounds.find((r) => r.trade?.hash) ?? rounds.rounds[0];
  const routes = [
    "/",
    "/explore",
    "/rooms",
    "/council",
    "/permission",
    "/markets",
    "/agents",
    "/fund",
    "/treasury",
    "/arc",
    "/history",
    "/runs",
    "/how",
    ...(latest ? [`/round/${latest.id}`] : []),
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    for (const route of routes) {
      try {
      await ready(route);
      // Allow RPC-derived content to settle without trusting network-idle on a polling app.
      if (
        ["/markets", "/agents", "/arc", "/permission", "/fund"].includes(
          route,
        ) ||
        route.startsWith("/round/")
      )
        await page.waitForTimeout(4500);
      const name =
        route === "/"
          ? "home"
          : route.startsWith("/round/")
            ? "round"
            : route.slice(1);
      const text = await page.locator("body").innerText();
      if (/\b(Monad|MON|AUSD|Perpl|Kuru|Mera)\b/.test(text))
        throw Error(`Old-chain copy on ${route}`);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      if (overflow) throw Error(`Horizontal overflow on ${route} at ${width}`);
      const broken = await page
        .locator("img")
        .evaluateAll(
          (es) => es.filter((e) => !e.complete || e.naturalWidth === 0).length,
        );
      if (broken) throw Error(`Broken image on ${route}`);
      const file = `${name}-${width}.png`;
      await page.screenshot({ path: resolve(out, file), fullPage: true });
      // Tall content scrolls inside the source phone frame. Capture the end as well.
      const didScroll = await page.evaluate(() => {
        const es = [...document.querySelectorAll("div")].filter(
          (e) =>
            getComputedStyle(e).overflowY === "auto" &&
            e.scrollHeight > e.clientHeight + 50,
        );
        const e = es.sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!e) return false;
        e.scrollTop = e.scrollHeight;
        return true;
      });
      if (didScroll) {
        await page.waitForTimeout(250);
        await page.screenshot({
          path: resolve(out, `${name}-end-${width}.png`),
          fullPage: true,
        });
      }
      result.screens.push({ route, width, file, overflow, broken });
      console.log(`PASS route ${route} at ${width}: no overflow, broken images or stale-chain copy`);
      if (route === '/explore') {
        const more = page.getByTestId('explore-everything');
        await more.click();
        await until(async () => await more.getAttribute('aria-expanded') === 'true', 'Explore catalog expansion');
        await more.click();
        const stories = await page.locator('[data-testid^="explore-story-"]').evaluateAll(es => es.map(e => e.getAttribute('data-testid')));
        for (const id of stories) {
          await page.getByTestId(id).click();
          if (new URL(page.url()).pathname === '/explore') throw Error(`Dead story button ${id}`);
          await ready('/explore');
        }
        console.log(`PASS Explore catalog and ${stories.length} story buttons at ${width}`);
      }
      if (route === '/arc') {
        const details = page.locator('[data-testid^="arc-details-"]');
        for (let i=0; i<await details.count(); i++) {
          await details.nth(i).click();
          await until(async () => await details.nth(i).getAttribute('aria-expanded') === 'true', 'Arc details expansion');
        }
        console.log(`PASS Arc proof disclosures at ${width}`);
      }
      if (route === '/rooms') {
        for (const seat of cfg.seats) {
          const button = page.getByLabel(seat.name,{exact:true});
          await button.click();
          await until(async () => await button.getAttribute('aria-selected') === 'true', `agent room ${seat.name}`);
        }
        console.log(`PASS five agent rooms at ${width}`);
      }
      if (route === '/') {
        const toggle = page.getByTestId('toggle-balances');
        const label = await toggle.getAttribute('aria-label');
        await toggle.click();
        await until(async () => await toggle.getAttribute('aria-label') !== label, 'balance visibility');
        await toggle.click();
        console.log(`PASS balance privacy toggle at ${width}`);
      }
      if (route === '/council') {
        if (await page.getByTestId('autopilot-1').count()) throw Error('Autopilot offered while keeper off');
        console.log(`PASS keeper-off state at ${width}`);
      }
      } catch (e) { errors.push(`${route} ${width}: ${e.message}`); console.error(`FAIL ${route} ${width}: ${e.message}`); }
    }
  }
  const after = await Promise.all(
    [owner, cfg.executor].map((address) => pub.getBalance({ address })),
  );
  result.ownerBalanceBefore = formatEther(before[0]);
  result.executorBalanceBefore = formatEther(before[1]);
  result.ownerBalanceAfter = formatEther(after[0]);
  result.executorBalanceAfter = formatEther(after[1]);
  result.totalUsdcReduction = Number(
    formatEther(before[0] + before[1] - after[0] - after[1]),
  );
  if (result.totalUsdcReduction > 0.5) throw Error("Budget exceeded");
  const memoAbi = parseAbi(['event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)']);
  result.receipts = [];
  const roundsToCheck = [result.round, ...(result.followupRounds ?? []).map(x => x.round)].filter(Boolean);
  const hashes = [...new Set([...ownerHashes, ...result.transactions.map(t => t.hash)])];
  for (const hash of hashes) {
    const receipt = await pub.getTransactionReceipt({hash});
    if (receipt.status !== 'success') throw Error(`Receipt reverted: ${hash}`);
    const round = roundsToCheck.find(r => r.trade?.hash === hash);
    let memoId;
    if (round) {
      const memoLog = receipt.logs.filter(l => l.address.toLowerCase() === cfg.deployment.memo.toLowerCase()).map(l => {
        try { return decodeEventLog({abi:memoAbi,data:l.data,topics:l.topics}); } catch { return null; }
      }).find(l => l?.args.memoId === round.id && l.args.target.toLowerCase() === cfg.deployment.delegation.toLowerCase() && l.args.sender.toLowerCase() === cfg.executor.toLowerCase());
      if (!memoLog || !round.trade.memo.tagged) throw Error(`Missing actual Arc Memo event: ${hash}`);
      memoId = memoLog.args.memoId;
    }
    result.receipts.push({hash,status:receipt.status,blockNumber:String(receipt.blockNumber),gasUsdc:formatEther(receipt.gasUsed*receipt.effectiveGasPrice),...(memoId?{memoId}: {})});
  }
  for (const tx of result.transactions) console.log(`PASS ${tx.step} https://explorer.testnet.arc.io/tx/${tx.hash}`);
  if (errors.length) throw Error(`Browser errors: ${errors.length}`);
  // An API outage must offer recovery, and retry must restore the app.
  expectedOutage = true;
  await page.route(`${api}/config`, route => route.abort());
  await page.goto(origin);
  await page.getByTestId('retry-executor').waitFor();
  await page.unroute(`${api}/config`);
  await page.getByTestId('retry-executor').click();
  await page.getByTestId('toggle-balances').waitFor();
  expectedOutage = false;
  console.log('PASS executor outage recovery');
  result.passed = true;
} catch (e) {
  result.passed = false;
  result.failure = e.message;
  result.failurePage = await page.locator('body').innerText();
  result.pendingCalls = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('arc:durable-call:')).map(k => JSON.parse(localStorage.getItem(k))));
  await page.screenshot({path: resolve(out, 'failure.png'), fullPage: true});
  console.error(`FAIL ${e.message}`);
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(
      root,
      trade ? "docs/ROUND2-BROWSER-TESTNET.json" : "docs/ROUND2-SCREEN-CHECK.json",
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
