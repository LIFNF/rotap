import {JsonRpcProvider} from 'ethers';import {spawn} from 'node:child_process';
// The fixed endpoint prevents accidental signing for another network or forwarding through a fork.
export class MainnetProvider extends JsonRpcProvider {
 constructor(){super('https://rpc.mainnet.chain.robinhood.com',4663,{staticNetwork:true,cacheTimeout:-1,batchMaxCount:5});this.pollingInterval=1500;}
 async _send(payload){const result=await new Promise((resolve,reject)=>{const child=spawn('curl.exe',['--proxy','http://127.0.0.1:7890','--http1.1','--tlsv1.2','--tls-max','1.2','--connect-timeout','8','--max-time','60','--fail','--silent','--show-error','-H','Content-Type: application/json','--data-binary','@-','https://rpc.mainnet.chain.robinhood.com'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('close',code=>code===0?resolve(output):reject(Error('Mainnet RPC connection failed: '+error.trim().split('\n')[0])));child.stdin.end(JSON.stringify(payload));});const parsed=JSON.parse(result);return Array.isArray(parsed)?parsed:[parsed];}
}
