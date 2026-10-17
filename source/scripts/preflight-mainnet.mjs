import fs from 'node:fs';
import {JsonRpcProvider,formatEther,getAddress} from 'ethers';
const r=JSON.parse(fs.readFileSync('dist/release.json','utf8'));const p=new JsonRpcProvider(r.rpcUrl,undefined,{cacheTimeout:-1});
try{const network=await p.getNetwork(),owner=getAddress(r.owner.toLowerCase());console.log(JSON.stringify({chainId:Number(network.chainId),owner,balanceETH:formatEther(await p.getBalance(owner)),block:await p.getBlockNumber()},null,2));}finally{p.destroy();}
