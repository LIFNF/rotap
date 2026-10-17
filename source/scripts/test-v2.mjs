import {spawn} from 'node:child_process';
import fs from 'node:fs';
const tests=['test-transistor-sale','test-fixed-release-security','test-runtime','test-persistent-circuits','test-continuous-ledger','test-stake-boost','test-reward-stake','test-task-registry','test-mining-lifecycle','test-markets','test-accounts-sites','test-reference-circuits','test-burn-boost','test-account-pure-reference','test-processor-factory','test-real-sampling-flow','test-mining-reference-governance','test-browser-ref-runtime'];
const report=[];
for(const name of tests){
 const start=Date.now();
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/'+name+'.mjs'],{stdio:['ignore','inherit','pipe']});let error='';child.stderr.on('data',chunk=>{error+=chunk.toString();if(error.length>30000)error=error.slice(-30000);});child.on('error',reject);child.on('close',code=>{if(code)process.stderr.write(error.slice(-6000));resolve(code);});});
 report.push({test:name,passed:code===0,milliseconds:Date.now()-start});
 fs.writeFileSync('audit/v2-test-suite.json',JSON.stringify({environment:'local test chains',mainnetDeployed:false,referenceParityVerified:false,tests:report},null,2));
 if(code!==0)throw Error(name+' failed');
}
console.log('All '+tests.length+' candidate contract suites passed. This is not a reference-chain equivalence or production-deployment result.');
