#!/usr/bin/env node
/** Exported Expo app + real Arc testnet. No keys, browser state or traces are written to disk. */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const root = resolve(import.meta.dirname, "..");
const api = "http://127.0.0.1:9120";
const origin = "http://127.0.0.1:9130";
const trade = process.argv.includes("--trade");
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
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: "reduce",
});
await context.addInitScript((k) => {
  localStorage.setItem("xorr.arc.deviceKey", k);
}, key);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
const out = resolve(root, "docs/screens/testnet");
mkdirSync(out, { recursive: true });
const result = {
  date: new Date().toISOString(),
  owner,
  executor: cfg.executor,
  chainId: cfg.chainId,
  trade,
  transactions: [],
  screens: [],
  errors,
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
    if (await fn()) return;
    await page.waitForTimeout(1000);
  }
  throw Error(`Timed out: ${what}`);
}
try {
  if (trade) {
    if (Number(formatEther(before[0])) < 0.075)
      throw Error(
        "Owner needs at least 0.075 USDC for capped browser rehearsal",
      );
    await ready("/permission");
    await page.getByTestId("grant").click();
    await until(async () => {
      const a = await account();
      return (
        a.permission.granted &&
        !a.permission.revoked &&
        !a.permission.stopped &&
        a.permission.dailyCap === 0.1
      );
    }, "grant");
    console.log("Browser grant confirmed: 0.10 USDC/day, 1 day, 2% floor.");
    const txs = await page
      .locator('[data-testid^="tx-"]')
      .evaluateAll((es) => es.map((e) => e.textContent));
    result.grantLinks = txs;
    await page.screenshot({
      path: resolve(out, "permission-granted-1280.png"),
    });
    await ready("/council");
    const response = page.waitForResponse(
      (r) => r.url() === `${api}/rounds` && r.request().method() === "POST",
      { timeout: 60000 },
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
    await page.screenshot({ path: resolve(out, "council-result-1280.png") });
    console.log(
      `Browser council: ${round.summary}; trade ${round.trade?.hash ?? "not filled"}`,
    );
    // Always revoke, including a veto or failed fill, before asserting the trade.
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
    console.log("Browser hold-to-stop confirmed on chain.");
    await page.waitForTimeout(500);
    result.revokeLinks = await page
      .locator('[data-testid^="tx-"]')
      .evaluateAll((es) => es.map((e) => e.textContent));
    await page.screenshot({ path: resolve(out, "home-revoked-1280.png") });
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
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    for (const route of routes) {
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
      console.log(`captured ${route} at ${width}`);
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
  if (errors.length) throw Error(`Browser errors: ${errors.length}`);
  result.passed = true;
} catch (e) {
  result.passed = false;
  result.failure = e.message;
  console.error(e.message);
  process.exitCode = 1;
} finally {
  writeFileSync(
    resolve(
      root,
      trade ? "docs/UI-BROWSER-TESTNET.json" : "docs/UI-SCREEN-CHECK.json",
    ),
    JSON.stringify(result, null, 2) + "\n",
  );
  await context.close();
  await browser.close();
  await new Promise((r) => server.close(r));
}
