import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory,Interface} from 'ethers';
const names=['ROtapRuntime.sol','ROtapTaskRegistry.sol','ROtapSamplingPolicy.sol'],sources=Object.fromEntries(names.map(name=>[name,{content:fs.readFileSync('contracts/'+name,'utf8')}])) ;
sources['Empty.sol']={content:'pragma solidity ^0.8.24; contract Empty {}'};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((output.errors||[]).filter(e=>e.severity==='error').length,0,JSON.stringify(output.errors));
const dbPath='.test-chain/sampling-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true}});
try{
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}),signer=await provider.getSigner();const deploy=async(file,name,args=[])=>{const a=output.contracts[file][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,signer).deploy(...args);await c.waitForDeployment();return c;};
 const dummy=await deploy('Empty.sol','Empty'),policy=await deploy('ROtapSamplingPolicy.sol','ROtapSamplingPolicy',[await dummy.getAddress()]),runtime=await deploy('ROtapRuntime.sol','ROtapRuntimeHarness');
 const labels=JSON.parse(fs.readFileSync('reference-v2/sampling-read-labels.json','utf8')),responses=JSON.parse(fs.readFileSync('reference-v2/sampling-read-results.json','utf8')).responses,original=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/podLens.json','utf8'))),ci=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/circuits.json','utf8')));
 const cLabels=JSON.parse(fs.readFileSync('reference-v2/sampling-circuit-labels.json','utf8')),cResponses=JSON.parse(fs.readFileSync('reference-v2/sampling-circuit-results.json','utf8')).responses,circuits={};
 for(const response of cResponses){const label=cLabels[response.id-1];circuits[label.tokenId]??={};circuits[label.tokenId][label.name]=ci.decodeFunctionResult(label.name,response.result);}
 let matched=0;const counts=[];
 for(const response of responses){const label=labels[response.id-1];if(label.kind!=='sample'||!response.result||response.result==='0x')continue;
  const block=responses.find(r=>labels[r.id-1].kind==='block'&&labels[r.id-1].anchor===label.anchor),expected=Array.from(original.decodeFunctionResult('sampleIndexes',response.result)[0]);
  const actual=Array.from(await policy.indexes(block.result.hash,'0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6',label.circuitId,256,expected.length));assert.deepEqual(actual,expected,'Original hash/index encoding mismatch');
  const c=circuits[label.circuitId],info=c.circuitInfo,live=await runtime.liveGates(c.netlist[0],info[0],info[1]);const cycles=label.taskId===1?1:label.taskId===27?32:13;
  assert.equal(await policy.sampleCountFor(live,cycles),BigInt(expected.length),'Original sample count mismatch');counts.push({circuitId:label.circuitId,taskId:label.taskId,liveGates:live.toString(),samples:expected.length});matched++;
 }
 assert.equal(matched,6);assert.equal(await policy.runGasFor(1,2),106000n);assert.equal(await policy.runGasFor(100,10),3500000n);assert.equal(await policy.sampleCountFor(100,1),22n);
 assert.equal(await policy.checkBudget(5000,1,3),false);assert.equal(await policy.sampleCountFor(100000,32),3n);
 assert.equal(await runtime.liveGates('0x000000020000020000000300000300000002000002',1,1),1n);
 fs.writeFileSync('audit/reference-sampling-comparison.json',JSON.stringify({referenceBlock:'0x45ff3fb',matchedOriginalSampleTraces:matched,counts,hashEncoding:'keccak256(abi.encodePacked(bytes32 anchorHash,address circuits,uint256 circuitId,uint32 sampleIndex)) % vectorCount',duplicateSamplesAllowed:true,initialGasParametersMatched:true,budgetGovernanceReferenceVerified:false},null,2));
 console.log('PASS: 6 original-chain sampling traces, exact uint32 hash encoding, repeated indexes, live-gate counts, cycle-dependent sample sizes and initial gas limits matched. Governance changes pending.');
}finally{await rpc.disconnect();}
