import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const [inputName,outputName]=process.argv.slice(2);for(const name of [inputName,outputName])if(!/^[a-zA-Z0-9_-]+\.json$/.test(name||''))throw Error('Use a reference-v2 JSON file name');
const root=path.resolve('reference-v2'),input=path.join(root,inputName),output=path.join(root,outputName),queries=JSON.parse(fs.readFileSync(input,'utf8'));
const allowed=new Set(['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_call','eth_getCode','eth_getStorageAt','eth_getLogs']);
if(!Array.isArray(queries)||queries.some(q=>!allowed.has(q.method)))throw Error('Only public read-only RPC requests are permitted');
const responses=[];for(let start=0;start<queries.length;start+=5){
 const chunk=queries.slice(start,start+5).map((q,i)=>({...q,jsonrpc:'2.0',id:q.id??start+i+1}));
 const request=path.join(root,'rpc-public-batch.json');fs.writeFileSync(request,JSON.stringify(chunk));
 const result=spawnSync('curl.exe',['--proxy','http://127.0.0.1:7890','--http1.1','--tlsv1.2','--tls-max','1.2','--connect-timeout','8','--max-time','20','--fail','--silent','--show-error','-H','Content-Type: application/json','--data-binary','@'+request,'https://xlayerrpc.okx.com'],{encoding:'utf8',maxBuffer:10*1024*1024});
 if(result.status!==0)throw Error('Read-only RPC connection failed: '+result.stderr.trim().split('\n')[0]);
 const data=JSON.parse(result.stdout);if(!Array.isArray(data))throw Error('RPC rejected the read batch: '+JSON.stringify(data));responses.push(...data);
 fs.writeFileSync(output,JSON.stringify({endpoint:'https://xlayerrpc.okx.com',readOnly:true,responses},null,2));
 console.log('Read '+responses.length+'/'+queries.length+' public calls');
}
