/** Public video round archive; chain reads only, never imports executor wallets. */
import assert from 'node:assert/strict';import fs from 'node:fs';
import {createPublicClient,http,parseAbi,parseEventLogs} from 'viem';
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io')});assert.equal(await client.getChainId(),5042);
const d=JSON.parse(fs.readFileSync('deployments/arc-mainnet.json','utf8'));
const {rounds}=JSON.parse(fs.readFileSync('../video/.tmp/xorr-A/arc-mainnet.json','utf8'));
const abi=parseAbi(['event DecisionRecorded(bytes32 indexed id,address indexed owner,address indexed asset,bool isBuy,bool approved,uint8[] votes,uint256 priceAtVote)']);
for(const r of rounds){
 assert(r.record?.hash);const receipt=await client.getTransactionReceipt({hash:r.record.hash});assert.equal(receipt.status,'success');
 const e=parseEventLogs({abi,logs:receipt.logs,eventName:'DecisionRecorded'}).find(e=>e.address.toLowerCase()===d.council.toLowerCase()&&e.args.id===r.id);assert(e);assert.equal(e.args.owner.toLowerCase(),r.owner.toLowerCase());
 if(r.trade?.hash)assert.equal((await client.getTransactionReceipt({hash:r.trade.hash})).status,'success');
}
fs.writeFileSync('deployments/hosted-rounds-mainnet.json',JSON.stringify({chainId:5042,council:d.council,verifiedAt:new Date().toISOString(),source:'Original mainnet video rounds; successful council and trade receipts verified. Historical observations, not current market quotes.',rounds},null,2)+'\n');
console.log('PASS: verified',rounds.length,'historical mainnet council rounds');
