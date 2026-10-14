/** Live Arc testnet: bounded approval, grant, one hosted council round, revoke. */
import {writeFileSync,mkdirSync} from 'node:fs';
import {createPublicClient,createWalletClient,defineChain,http,formatEther,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {delegationAbi,erc20Abi} from '../src/abis.js';
import {requestMessage} from '../src/auth.js';
const API='https://executor-production-bdf5.up.railway.app';
const RPC='https://rpc.blockdaemon.testnet.arc.io';
const c=await(await fetch(`${API}/config`)).json();
if(c.chainId!==5042002||c.fork||!c.executor)throw Error('Not live configured Arc testnet');
const d=c.deployment;
const chain=defineChain({id:5042002,name:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[RPC]}}});
const account=privateKeyToAccount(process.env.OWNER_KEY as Hex);
const pub=createPublicClient({chain,transport:http(RPC)});
const wallet=createWalletClient({account,chain,transport:http(RPC)});
if(await pub.getChainId()!==5042002)throw Error('Wrong RPC');
let gasCost=0n;
const txs:{action:string,hash:Hex,gasUSDC:string}[]=[];
async function tx(address:Address,abi:any,functionName:string,args:any[]){
 const gas=(await pub.estimateContractGas({account,address,abi,functionName,args}))*115n/100n;
 if(gasCost+gas*40000000000n>80000000000000000n)throw Error('Owner gas budget exceeded');
 const hash=await wallet.writeContract({address,abi,functionName,args,gas,maxFeePerGas:40000000000n,maxPriorityFeePerGas:1000000000n});
 const r=await pub.waitForTransactionReceipt({hash});if(r.status!=='success')throw Error(`${functionName} reverted`);
 const cost=r.gasUsed*r.effectiveGasPrice;gasCost+=cost;txs.push({action:functionName,hash,gasUSDC:formatEther(cost)});
}
const spent=await pub.readContract({address:d.delegation,abi:delegationAbi,functionName:'spentTodayBy',args:[account.address,c.executor]});
await tx(d.usdc,erc20Abi,'approve',[d.delegation,40000n]);
let round:any;
try{
 await tx(d.delegation,delegationAbi,'grant',[c.executor,spent+50000n,BigInt(Math.floor(Date.now()/1000)+600),200,[d.venue]]);
 const body={sym:'WETH',side:'buy',usd:0.04};const at=Date.now();
 const signature=await account.signMessage({message:requestMessage('round',account.address,body,at)});
 const r=await fetch(`${API}/rounds`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({owner:account.address,body,at,signature})});
 const j=await r.json();if(!r.ok)throw Error(j.error);round=j.round;
}finally{await tx(d.delegation,delegationAbi,'revoke',[]);}
for(const [label,h] of [['council',round.record?.hash],['trade',round.trade?.hash]])if(h){const r=await pub.waitForTransactionReceipt({hash:h as Hex});const cost=r.gasUsed*r.effectiveGasPrice;gasCost+=cost;txs.push({action:label!,hash:h as Hex,gasUSDC:formatEther(cost)});}
const total=gasCost+(round.trade?.hash?40000000000000000n:0n);
const result={network:'Live Arc testnet',owner:account.address,api:API,round,transactions:txs,permission:'revoked',totalTestnetUSDC:formatEther(total)};
mkdirSync('../docs/screens/hosted',{recursive:true});writeFileSync('../docs/screens/hosted/action.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({round:round.id,decision:round.decision,summary:round.summary,trade:round.trade?.hash,permission:'revoked',totalTestnetUSDC:formatEther(total)}));
if(total>200000000000000000n)throw Error('Budget exceeded');
if(round.decision!=='vetoed'&&!round.trade?.hash)throw Error('Round neither safely vetoed nor traded');
