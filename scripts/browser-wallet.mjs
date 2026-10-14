#!/usr/bin/env node
/** Local-only EIP-1193 test wallet for browser-control tools. Real testnet signatures; no key leaves this process. */
import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatEther,
  decodeFunctionData,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const root = resolve(import.meta.dirname, "..");
const deployment = JSON.parse(
  readFileSync(resolve(root, "deployments/arc-testnet.json"), "utf8"),
);
const key = /^OWNER_KEY=(0x[0-9a-fA-F]{64})/m.exec(
  readFileSync(
    resolve(
      root,
      process.env.OWNER_KEY_FILE ?? "../.deployer/xorr-testnet-owner.env",
    ),
    "utf8",
  ),
)?.[1];
if (!key) throw Error("Missing testnet owner");
const account = privateKeyToAccount(key);
const chain = defineChain({
  id: 5042002,
  name: "Arc testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
});
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });
if ((await pub.getChainId()) !== 5042002) throw Error("Testnet only");
const token = randomBytes(32).toString("hex");
const origin = "http://127.0.0.1:9130";
const evidence = {
  date: new Date().toISOString(),
  owner: account.address,
  transactions: [],
  signatures: 0,
};
const before = await pub.getBalance({ address: account.address });
let busy = false;
const abi = parseAbi([
  "function approve(address,uint256)",
  "function grant(address,uint256,uint64,uint16,address[])",
  "function setGuardian(address,bool)",
  "function revoke()",
  "function revokeAgent(address)",
]);
async function request(method, params = []) {
  console.log(`test wallet request: ${method}`);
  if (method === "eth_accounts" || method === "eth_requestAccounts")
    return [account.address];
  if (method === "eth_chainId") return "0x4cef52";
  if (
    method === "wallet_switchEthereumChain" ||
    method === "wallet_addEthereumChain"
  ) {
    if (params[0]?.chainId !== "0x4cef52") throw Error("Testnet only");
    return null;
  }
  if (method === "personal_sign") {
    const message = Buffer.from(params[0].slice(2), "hex").toString("utf8");
    if (
      !message.startsWith(
        `XORR on Arc\naction: round\nowner: ${account.address}\n`,
      )
    )
      throw Error("Only XORR round signatures allowed");
    const input = JSON.parse(message.split("\nbody: ")[1].split("\nat: ")[0]);
    if (
      input.sym !== "WETH" ||
      input.side !== "buy" ||
      input.usd > 0.04 ||
      evidence.signatures >= 2
    )
      throw Error("Round outside browser budget");
    evidence.signatures++;
    return wallet.signMessage({ message });
  }
  if (method === "eth_sendTransaction") {
    if (busy) throw Error("Transaction in flight");
    busy = true;
    try {
      const t = params[0];
      if (
        t.from.toLowerCase() !== account.address.toLowerCase() ||
        BigInt(t.value ?? 0) !== 0n
      )
        throw Error("Unexpected owner or value");
      const call = decodeFunctionData({ abi, data: t.data });
      const args = call.args ?? [];
      const target = t.to.toLowerCase();
      if (call.functionName === "approve") {
        if (
          ![
            deployment.usdc,
            deployment.weth,
            deployment.cbtc,
            deployment.eurc,
          ].some((a) => a.toLowerCase() === target) ||
          args[0].toLowerCase() !== deployment.delegation.toLowerCase()
        )
          throw Error("Unexpected approval");
      } else {
        if (target !== deployment.delegation.toLowerCase())
          throw Error("Unexpected contract");
        if (
          call.functionName === "grant" &&
          (args[0].toLowerCase() !== deployment.executor.toLowerCase() ||
            args[1] > 100000n ||
            args[2] > BigInt(Math.floor(Date.now() / 1000) + 86460) ||
            args[3] > 200 ||
            args[4].length !== 1 ||
            args[4][0].toLowerCase() !== deployment.venue.toLowerCase())
        )
          throw Error("Permission outside rehearsal limits");
        if (
          call.functionName === "setGuardian" &&
          args[0].toLowerCase() !== deployment.stopReceiver.toLowerCase()
        )
          throw Error("Unexpected guardian");
        if (
          call.functionName === "revokeAgent" &&
          args[0].toLowerCase() !== deployment.executor.toLowerCase()
        )
          throw Error("Unexpected agent");
      }
      const spent =
        before - (await pub.getBalance({ address: account.address }));
      const gas = BigInt(t.gas);
      const fee = BigInt(t.maxFeePerGas ?? 60000000000n);
      if (
        spent + gas * fee > 150000000000000000n ||
        evidence.transactions.length >= 10
      )
        throw Error("Browser gas budget exceeded");
      const hash = await wallet.sendTransaction({
        to: t.to,
        data: t.data,
        gas,
        nonce: t.nonce ? Number(BigInt(t.nonce)) : undefined,
        maxFeePerGas: fee,
        maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas ?? 1000000000n),
      });
      const r = await pub.waitForTransactionReceipt({ hash });
      evidence.transactions.push({
        step: call.functionName,
        hash,
        status: r.status,
        feeUsdc: formatEther(r.gasUsed * r.effectiveGasPrice),
      });
      writeFileSync(
        resolve(root, "docs/UI-OWNER-TRANSACTIONS.json"),
        JSON.stringify(evidence, null, 2) + "\n",
      );
      console.log(`${call.functionName} ${hash} ${r.status}`);
      return hash;
    } finally {
      busy = false;
    }
  }
  throw Error(`Unsupported test wallet method: ${method}`);
}
const bootstrap = `<script>window.xorrTestWallet={request:async function(a){const r=await fetch('/__wallet',{method:'POST',headers:{'content-type':'application/json','x-test-capability':'${token}'},body:JSON.stringify(a)});const o=await r.json();if(o.error)throw Error(o.error);return o.result;}};</script>`;
const mimes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.url === "/__wallet") {
      if (
        req.method !== "POST" ||
        req.headers.origin !== origin ||
        req.headers["x-test-capability"] !== token
      ) {
        res.writeHead(403);
        return res.end();
      }
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 20000) throw Error("Request too large");
      }
      const { method, params } = JSON.parse(text);
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ result: await request(method, params) }));
    }
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
    const content = readFileSync(file);
    res.end(
      extname(file) === ".html"
        ? content.toString().replace("<head>", "<head>" + bootstrap)
        : content,
    );
  } catch (e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: e.shortMessage ?? e.message }));
  }
});
server.listen(9130, "127.0.0.1", () =>
  console.log(
    `Browser test wallet + exported web: ${origin}, PID ${process.pid}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
