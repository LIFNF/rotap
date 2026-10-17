import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory,Interface} from 'ethers';
const bank=JSON.parse(fs.readFileSync('reference-v2/taskbank-with-netlists.json','utf8')),cases=JSON.parse(fs.readFileSync('reference-v2/runtime-reference-cases.json','utf8')),snapshot=JSON.parse(fs.readFileSync('reference-v2/runtime-reference-results.json','utf8'));
const original=new Map();for(const group of JSON.parse(snapshot.body))for(const response of group.data)original.set(response.id,response);
const selected=cases.map((test,index)=>({test,index})).filter(x=>original.has(x.index+1));
assert.equal(original.size,100,'Incomplete original-chain responses');
const iface=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/circuits.json','utf8')));
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Runtime.sol':{content:fs.readFileSync('contracts/ROtapRuntime.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((compiled.errors||[]).filter(e=>e.severity==='error').length,0);
const artifact=compiled.contracts['Runtime.sol'].ROtapRuntimeHarness,dbPath='.test-chain/reference-runtime-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true}});
try{
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1});const local=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,await provider.getSigner()).deploy();await local.waitForDeployment();
 const differences=[];let metricsMatched=0,outputsMatched=0,rejectionsMatched=0;
 // The original Task.refArea stores the unweighted reference base (NAND+LATCH),
 // while refCost includes the weighted area NAND+7*LATCH. Keep these separate.
 for(const task of bank.tasks){const metrics=await local.metrics(task.referenceNetlist,task.nIn,task.nOut);if(metrics.burn.toString()!==task.refArea||metrics.cost.toString()!==task.refCost)differences.push({taskId:task.taskId,kind:'metrics',expectedReferenceBase:task.refArea,referenceBase:metrics.burn.toString(),expectedCost:task.refCost,cost:metrics.cost.toString()});else metricsMatched++;}
 for(const {test,index:i} of selected){
  const task=bank.tasks.find(t=>t.taskId===test.taskId),reference=original.get(i+1);let actual,error;
  try{actual=Array.from(await local.step(task.referenceNetlist,task.nIn,task.nOut,test.state,test.input));}catch(e){error=e.shortMessage||e.message;}
  if(reference.error){if(error)rejectionsMatched++;else differences.push({taskId:test.taskId,index:test.index,kind:'accepted-original-rejected',original:reference.error});continue;}
  const decoded=Array.from(iface.decodeFunctionResult(test.method,reference.result));const expected=test.method==='eval'?['0x',decoded[0]]:decoded;
  if(error||JSON.stringify(actual)!==JSON.stringify(expected))differences.push({taskId:test.taskId,index:test.index,kind:'output',expected,actual,error});else outputsMatched++;
 }
 const report={chainId:196,referenceBlock:bank.block,referenceCircuits:bank.tasks[0].refCircuits,referenceTasks:bank.tasks.length,metricsMatched,originalCalls:selected.length,missingOriginalTaskIds:bank.tasks.filter(t=>!original.has((t.taskId-1)*3+1)).map(t=>t.taskId),outputsMatched,rejectionsMatched,differences,scope:'Only successfully downloaded original calls are compared; missing cases and full protocol parity remain pending'};
 fs.writeFileSync('audit/reference-runtime-comparison.json',JSON.stringify(report,null,2));
 assert.equal(differences.length,0,JSON.stringify(differences.slice(0,8)));
 console.log(`PASS: ${metricsMatched} original task metrics and ${outputsMatched} original-chain runtime cases matched; ${rejectionsMatched} input rejections matched. This covers NAND/LATCH execution only.`);
}finally{await rpc.disconnect();}
