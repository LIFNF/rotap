import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
// Only these read methods may leave this process. All simulated writes go to Ganache.
const allowed=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getStorageAt','eth_getBalance','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getProof','eth_getLogs','eth_call']);
export function referenceForkProvider(){
 const root=path.resolve('.test-chain/reference-rpc-cache');fs.mkdirSync(root,{recursive:true});let misses=0,hits=0;
 return {stats:()=>({publicRpcReads:misses,cacheHits:hits,broadcasts:0}),async request({method,params=[]}){
  if(!allowed.has(method))throw Error('Reference RPC write blocked: '+method);
  const key=createHash('sha256').update(JSON.stringify([method,params])).digest('hex'),file=path.join(root,key+'.json');try{const cached=JSON.parse(fs.readFileSync(file,'utf8'));hits++;return cached.result;}catch(error){if(error.code!=='ENOENT')throw error;}
  const request=path.join(root,key+'-request.json');fs.writeFileSync(request,JSON.stringify({jsonrpc:'2.0',id:1,method,params}));
  const raw=await new Promise((resolve,reject)=>{const child=spawn('curl.exe',['--proxy','http://127.0.0.1:7890','--http1.1','--tlsv1.2','--tls-max','1.2','--connect-timeout','8','--max-time','18','--retry','2','--retry-all-errors','--retry-delay','1','--fail','--silent','--show-error','-H','Content-Type: application/json','--data-binary','@'+request,'https://xlayerrpc.okx.com'],{windowsHide:true});let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code?reject(Error('Read-only reference connection failed: '+stderr.trim().split('\n')[0])):resolve(stdout));});
  const value=JSON.parse(raw);if(value.error){const error=Error(value.error.message);error.code=value.error.code;error.data=value.error.data;throw error;}fs.writeFileSync(file,JSON.stringify({method,params,result:value.result}));fs.rmSync(request,{force:true});misses++;if(misses%25===0)console.log('Loaded '+misses+' public state records for the local fork.');return value.result;
 }};
}
