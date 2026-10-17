import {verifyReleaseInputs} from './verify-release-inputs.mjs';
import { build } from 'esbuild';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createRoutePages} from './create-route-pages.mjs';
import {removeLegacyAssets} from './remove-legacy-assets.mjs';
import pricing from '../config/mint-pricing.json' with {type:'json'};
verifyReleaseInputs();fs.mkdirSync('dist',{recursive:true});fs.cpSync('public','dist',{recursive:true});removeLegacyAssets('dist');
const network=JSON.parse(fs.readFileSync('config/network.json','utf8'));
const deployment=fs.existsSync('config/deployment.json')?JSON.parse(fs.readFileSync('config/deployment.json','utf8')):null;
if(deployment){if(deployment.verified!==true||deployment.chainId!==network.chainId)throw Error('Deployment configuration must be verified');if(deployment.independentReview?.status!=='approved'||deployment.sourceVerification?.status!=='verified')throw Error('Independent review and explorer source verification required');Object.assign(network,deployment.addresses,{deploymentBlock:deployment.deploymentBlock,stage:'mainnet',releaseId:deployment.releaseId,releaseVerified:true,codeHashes:deployment.verification.codeHashes,independentReview:deployment.independentReview,sourceVerification:deployment.sourceVerification});}
network.protocolVersion=2;delete network.protocolAddress;
fs.writeFileSync('dist/network.json',JSON.stringify(network,null,2));
fs.writeFileSync('dist/release.json',JSON.stringify({protocolVersion:2,chainId:network.chainId,owner:pricing.recipient,deploymentBlocked:!deployment,blockReason:deployment?null:'主网合约尚未完成部署与完整验收，当前不接受链上付款。',taskCount:100,mintPricing:pricing,releaseId:deployment?.releaseId||null},null,2));
fs.writeFileSync('dist/deployment-evidence.json',JSON.stringify(deployment?{status:'verified',chainId:4663,releaseId:deployment.releaseId,addresses:deployment.addresses,verification:deployment.verification,sourceVerification:deployment.sourceVerification,independentReview:deployment.independentReview}:{status:'pending',chainId:4663,addresses:null,deploymentTransactions:[],independentReview:{status:'pending'},sourceVerification:{status:'pending'},paymentsEnabled:false},null,2));
fs.mkdirSync('dist/abi',{recursive:true});for(const file of fs.readdirSync('dist/abi'))if(file.endsWith('.json'))fs.unlinkSync('dist/abi/'+file);
const candidateManifest=JSON.parse(fs.readFileSync('candidate-v2/manifest.json','utf8'));
for(const name of Object.keys(candidateManifest.contracts)){const artifact=JSON.parse(fs.readFileSync('candidate-v2/'+name+'.json','utf8'));fs.writeFileSync('dist/abi/'+name+'.json',JSON.stringify(artifact.abi));}
fs.copyFileSync('src/protocol.css','dist/protocol.css');
fs.mkdirSync('dist/reports',{recursive:true});if(fs.existsSync('audit/public'))fs.cpSync('audit/public','dist/reports',{recursive:true});fs.writeFileSync('dist/audit-summary.json',fs.existsSync('audit/audit-summary.json')?fs.readFileSync('audit/audit-summary.json') : JSON.stringify({status:'pending',kind:'automated',tools:[],limitations:['自动化扫描尚未完成。','独立人工审查尚未完成。']}));
const index=fs.readFileSync('dist/index.html','utf8');if(!index.includes('/protocol.css'))fs.writeFileSync('dist/index.html',index.replace('</head>','<link rel="stylesheet" href="/protocol.css"></head>'));
const vectorBank=JSON.parse(fs.readFileSync('config/task-bank.json','utf8'));
fs.mkdirSync('dist/vectors',{recursive:true});
for(const task of vectorBank.tasks){const vectorFile=JSON.parse(fs.readFileSync('config/vectors/task-'+task.taskId+'.json','utf8'));if(vectorFile.root.toLowerCase()!==task.vectorsRoot.toLowerCase()||vectorFile.vectors.length!==task.vectorCount)throw Error('Official vector mismatch: '+task.taskId);fs.writeFileSync('dist/vectors/task-'+task.taskId+'.json',JSON.stringify(vectorFile));}
await import('./pixel-art.mjs');
await import('./cyber-art.mjs');
fs.mkdirSync('dist/fonts',{recursive:true});
fs.copyFileSync('node_modules/@fontsource/fusion-pixel-12px-proportional-sc/files/fusion-pixel-12px-proportional-sc-latin-400-normal.woff2','dist/fonts/rotap-pixel.woff2');
fs.copyFileSync('node_modules/@fontsource/fusion-pixel-12px-proportional-sc/LICENSE','dist/fonts/LICENSE-OFL.txt');
fs.writeFileSync('dist/fonts/pixel.css',"@font-face{font-family:'ROtap Pixel';font-style:normal;font-weight:400;font-display:swap;src:url('./rotap-pixel.woff2') format('woff2')}\n");
await build({entryPoints:['src/app.js'],bundle:true,format:'esm',target:['es2022'],outfile:'dist/app.js',minify:true,sourcemap:false});
await build({entryPoints:['src/launch.js'],bundle:true,format:'esm',target:['es2022'],outfile:'dist/launch.js',minify:true,sourcemap:false});
for(const html of ['dist/index.html','dist/launch.html']){
 const source=fs.readFileSync(html,'utf8');
 fs.writeFileSync(html,source.replace(/((?:src|href)=")\/(app\.js|launch\.js|style\.css|pixel\.css|cyber\.css|protocol\.css)(?:\?v=[^"]*)?"/g,(_,prefix,file)=>prefix+'/'+file+'?v='+createHash('sha256').update(fs.readFileSync('dist/'+file)).digest('hex').slice(0,12)+'"'));
}
for(const file of ['dist/index.html','dist/style.css','dist/network.json'])if(!fs.existsSync(file))throw Error('Missing '+file);
console.log('ROtap build complete');

fs.copyFileSync('config/mint-pricing.json','dist/mint-pricing.json');
createRoutePages('dist','/');
await import('./verify-current-release.mjs');
