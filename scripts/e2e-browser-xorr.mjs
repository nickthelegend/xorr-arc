#!/usr/bin/env node
/** Browser runner. One local executor + one static server; no anvil, mocks or paid resources. */
import {spawn} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPublicClient,createWalletClient,defineChain,http,parseAbi,formatEther} from 'viem';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
const root=resolve(import.meta.dirname,'..');
const trade=process.argv.includes('--trade');
const rpc='https://rpc.testnet.arc.io';
const chain=defineChain({id:5042002,name:'Arc testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[rpc]}}});
const pub=createPublicClient({chain,transport:http()});
const d=JSON.parse(readFileSync(resolve(root,'deployments/arc-testnet.json'),'utf8'));
const keyFrom=(file,names)=>new RegExp(`^(?:${names})=(0x[0-9a-fA-F]{64})`,'m').exec(readFileSync(file,'utf8'))?.[1];
const roles=resolve(root,process.env.XORR_EXECUTOR_KEY_FILE??'../.deployer/xorr-roles.env');
const executorKey=keyFrom(roles,'XORR_EXECUTOR_KEY|XORR_EXECUTOR_PRIVATE_KEY');
if(!executorKey || privateKeyToAccount(executorKey).address.toLowerCase()!==d.executor.toLowerCase()) throw Error('Wrong executor key file');
mkdirSync(resolve(root,'.keys'),{recursive:true});
mkdirSync(resolve(root,'.fork/round2-data'),{recursive:true});
// A fresh owner per funded run avoids carrying the previous run's daily spend into this rehearsal.
// Retain every recovery key; never overwrite an earlier funded owner's key.
const ownerFile=resolve(root,trade ? `.keys/round2-owner-${Date.now()}.env` : '.keys/round2-owner.env');
if(!existsSync(ownerFile)) writeFileSync(ownerFile,`OWNER_KEY=${generatePrivateKey()}\n`,{mode:0o600});
const owner=privateKeyToAccount(keyFrom(ownerFile,'OWNER_KEY'));
const wallet=createWalletClient({account:owner,chain,transport:http()});
const children=new Set();
let funded=false;
let executorFunded=0n;
let executorSwept=0n;
const evidence={date:new Date().toISOString(),chainId:5042002,owner:owner.address,ownerKeyFile:ownerFile.slice(root.length+1),transactions:[]};
const env={...process.env,EXPO_PUBLIC_API_URL:'http://127.0.0.1:9120',EXPO_PUBLIC_TEST_WALLET:'off',XORR_NETWORK:'arc-testnet',XORR_DEPLOYMENT:'deployments/arc-testnet.json',ARC_RPC_URL:rpc,XORR_EXECUTOR_KEY:executorKey,PORT:'9120',KEEPER:'off',XORR_TX_BUDGET_USDC:'0.15',XORR_DATA_DIR:'.fork/round2-data',ALLOWED_ORIGINS:'http://127.0.0.1:9130',OWNER_KEY_FILE:ownerFile};
function launch(args,opts={}){const p=spawn(process.execPath,args,{cwd:root,env,stdio:'inherit',...opts});children.add(p);p.once('exit',()=>children.delete(p));console.log(`PASS started PID ${p.pid}`);return p;}
const finish=p=>new Promise((yes,no)=>{p.once('error',no);p.once('exit',c=>c===0?yes():no(Error(`Child exited ${c}`)));});
async function tx(client,to,data,value=0n){
 const gas=await pub.estimateGas({account:client.account.address,to,data,value});
 if(gas*40000000000n>20000000000000000n) throw Error('Cleanup/funding gas exceeds 0.02 USDC');
 const hash=await client.sendTransaction({to,data,value,gas:gas*120n/100n,maxFeePerGas:40000000000n,maxPriorityFeePerGas:1000000000n});
 const r=await pub.waitForTransactionReceipt({hash});
 evidence.transactions.push({hash,from:client.account.address,to,valueUsdc:formatEther(value),status:r.status,gasUsdc:formatEther(r.gasUsed*r.effectiveGasPrice)});
 if(r.status!=='success') throw Error(`Transaction reverted ${hash}`);
 console.log(`PASS transaction https://explorer.testnet.arc.io/tx/${hash}`);
 return hash;
}
async function stop(){for(const p of [...children]) {p.kill('SIGTERM'); await Promise.race([new Promise(r=>p.once('exit',r)),new Promise(r=>setTimeout(r,3000))]); if(p.exitCode===null && p.signalCode===null)p.kill('SIGKILL');console.log(`PASS stopped PID ${p.pid}`);}}
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{process.exitCode=130;void stop();});
const beforeExecutor=await pub.getBalance({address:d.executor});
const beforeOwner=await pub.getBalance({address:owner.address});
try{
 if(await pub.getChainId()!==5042002)throw Error('Testnet only');
 for(const port of [9120,9130]){
   const {createServer}=await import('node:net');const probe=createServer();
   await new Promise((yes,no)=>{probe.once('error',no);probe.listen(port,'127.0.0.1',()=>probe.close(yes));});
 }
 await finish(launch(['node_modules/expo/bin/cli','export','--platform','web','--output-dir','dist-web','--max-workers','1']));
 // Confirm Chromium can start before any funding.
 const {chromium}=await import('playwright');const browser=await chromium.launch({headless:true});await browser.close();
 if(trade){
   const lock=resolve(root,'../.deployer/lock');
   for(let n=0;;n++){try{mkdirSync(lock);break;}catch(e){if(e.code!=='EEXIST'||n>=40)throw e;await new Promise(r=>setTimeout(r,1500));}}
   try{
     const key=keyFrom(resolve(root,'../.deployer/deployer.env'),'DEPLOYER_PRIVATE_KEY');
     const funder=createWalletClient({account:privateKeyToAccount(key),chain,transport:http()});
     if(funder.account.address.toLowerCase()!==d.deployer.toLowerCase())throw Error('Wrong deployer');
     const balance=await pub.getBalance({address:owner.address});
     if(balance<200000000000000000n)await tx(funder,owner.address,undefined,200000000000000000n-balance);
     funded=true;
     const executorBalance=await pub.getBalance({address:d.executor});
     if(executorBalance<200000000000000000n){
       executorFunded=200000000000000000n-executorBalance;
       await tx(funder,d.executor,undefined,executorFunded);
     }
   }finally{rmdirSync(lock);}
 }
 const executor=launch(['--import','./server/node_modules/tsx/dist/loader.mjs','server/src/index.ts']);
 let up=false;
 for(let i=0;i<60;i++){if(executor.exitCode!==null)throw Error('Executor exited');if(await fetch('http://127.0.0.1:9120/health').then(r=>r.ok,()=>false)){up=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!up)throw Error('Executor startup timed out');
 await finish(launch(['scripts/e2e-browser-pages.mjs',...(trade?['--trade']:[])]));
 evidence.passed=true;
}catch(e){evidence.passed=false;evidence.failure=e.message;console.error(`FAIL ${e.message}`);process.exitCode=1;}
finally{
 await stop();
 if(funded){
   try{
     const {encodeFunctionData}=await import('viem');
     const abi=parseAbi(['function revoke()','function isStopped(address) view returns(bool)']);
     if(!await pub.readContract({address:d.delegation,abi,functionName:'isStopped',args:[owner.address]}))await tx(wallet,d.delegation,encodeFunctionData({abi,functionName:'revoke'}));
     const balance=await pub.getBalance({address:owner.address});
     const gas=await pub.estimateGas({account:owner.address,to:d.deployer,value:1n});
     const reserve=gas*120n/100n*40000000000n;
     if(balance>reserve)await tx(wallet,d.deployer,undefined,balance-reserve);
     if(executorFunded){
       const executorBalance=await pub.getBalance({address:d.executor});
       const surplus=executorBalance-beforeExecutor-reserve;
       if(surplus>0n){
         const executorWallet=createWalletClient({account:privateKeyToAccount(executorKey),chain,transport:http()});
         executorSwept=surplus<executorFunded?surplus:executorFunded;
         await tx(executorWallet,d.deployer,undefined,executorSwept);
       }
     }
     console.log('PASS permission stopped and remaining owner USDC swept to deployer (gas dust retained)');
   }catch(e){console.error(`FAIL cleanup: ${e.shortMessage??e.message}; recovery key: ${evidence.ownerKeyFile}`);process.exitCode=1;}
 }
 const after=await pub.getBalance({address:d.executor});
 evidence.executorUsdcReduction=Number(formatEther(beforeExecutor+executorFunded-executorSwept-after));
 evidence.executorFundingUsdc=formatEther(executorFunded);
 evidence.executorSweptUsdc=formatEther(executorSwept);
 // Gross owner funding + executor reductions + a conservative cleanup/funding fee allowance.
 evidence.budgetUpperBoundUsdc=(funded?0.24:0)+Math.max(0,evidence.executorUsdcReduction);
 evidence.passed = evidence.passed === true && !process.exitCode;
 const afterOwner=await pub.getBalance({address:owner.address});
 const fundedUsdc=evidence.transactions.filter(t=>t.from.toLowerCase()===d.deployer.toLowerCase()).reduce((n,t)=>n+Number(t.valueUsdc)+Number(t.gasUsdc),0);
 const sweptUsdc=evidence.transactions.filter(t=>t.to.toLowerCase()===d.deployer.toLowerCase()).reduce((n,t)=>n+Number(t.valueUsdc),0);
 evidence.netCostUsdc=fundedUsdc-sweptUsdc+Number(formatEther(beforeOwner-afterOwner+beforeExecutor-after));
 evidence.ownerRemainingUsdc=formatEther(afterOwner);
 if(evidence.budgetUpperBoundUsdc>0.5){console.error('FAIL budget exceeds 0.5 USDC');process.exitCode=1;}
 evidence.passed = evidence.passed && !process.exitCode;
 writeFileSync(resolve(root,'docs/ROUND2-BROWSER-RUN.json'),JSON.stringify(evidence,null,2)+'\n');
}
