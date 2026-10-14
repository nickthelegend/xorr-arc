import * as c from './dryrun-common.mjs';
await c.run('xorr',async()=>{
 const n='xorr',d=c.load(n);
 const {delegationAbi:a,guardAbi,quoterV2Abi,swapRouter02Abi}=await import('../server/src/abis.ts');
 for(const role of ['buyer','executor'])await c.fund(n,role);
 await c.approve(n,'buyer',d.delegation,10000000n);
 await c.write(n,'grant permission 4 USDC cap','buyer',d.delegation,a,'grant',[c.roles.executor,4000000n,(await c.pub.getBlock()).timestamp+86400n,100,[d.venue]]);
 const amount=1000000n,token=d.eurc;
 const fair=await c.read(d.priceGuard,guardAbi,'quote',[c.USDC,token,amount]);
 const floor=fair*9900n/10000n;
 // The app uses the 500 fee tier for EURC.
 const fee=500;
 const q=await c.pub.simulateContract({address:d.quoter,abi:quoterV2Abi,functionName:'quoteExactInputSingle',args:[{tokenIn:c.USDC,tokenOut:token,amountIn:amount,fee,sqrtPriceLimitX96:0n}]});
 const minOut=q.result[0]*9900n/10000n;
 const args=(amount,min)=>[c.roles.buyer,d.venue,amount,token,min,c.toHex(0,{size:32}),c.encodeFunctionData({abi:swapRouter02Abi,functionName:'exactInputSingle',args:[{tokenIn:c.USDC,tokenOut:token,fee,recipient:c.roles.buyer,amountIn:amount,amountOutMinimum:min,sqrtPriceLimitX96:0n}]})];
 c.note('mainnetPool',{router:d.venue,tokenOut:token,fee,chainlinkFair:fair,chainlinkFloor:floor,uniswapQuote:q.result[0],minOut});
 await c.write(n,'Uniswap v3 trade inside cap + Chainlink floor','executor',d.delegation,a,'spend',args(amount,minOut));
 await c.write(n,'over-cap must revert DailyCapExceeded','executor',d.delegation,a,'spend',args(5000000n,1n),'DailyCapExceeded');
 await c.write(n,'revoke permission','buyer',d.delegation,a,'revoke');
 await c.write(n,'post-revoke must revert PolicyRevoked','executor',d.delegation,a,'spend',args(amount,minOut),'PolicyRevoked');
});
