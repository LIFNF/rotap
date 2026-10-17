import fs from 'node:fs';
import assert from 'node:assert/strict';
import solc from 'solc';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,hexlify} from 'ethers';
const source=fs.readFileSync('contracts/ROtapRuntime.sol','utf8');
const compiled=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Runtime.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((compiled.errors||[]).filter(x=>x.severity==='error').length,0,JSON.stringify(compiled.errors));
const artifact=compiled.contracts['Runtime.sol'].ROtapRuntimeHarness;
const dbPath='.test-chain/runtime-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});
const chain=ganache.provider({database:{dbPath},logging:{quiet:true}});
const u24=n=>[n>>>16&255,n>>>8&255,n&255];
const encode=gates=>hexlify(Uint8Array.from(gates.flatMap(g=>[g.op,...u24(g.a),...(g.op===0?u24(g.b):[])])));
let seed=1937;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
try{
 const provider=new BrowserProvider(chain,undefined,{cacheTimeout:-1});const runtime=await new ContractFactory(artifact.abi,artifact.evm.bytecode.object,await provider.getSigner()).deploy();await runtime.waitForDeployment();
 for(let design=0;design<24;design++){
  const gates=[];for(let gate=0;gate<1+random(16);gate++)gates.push({op:0,a:random(5+gate),b:random(5+gate)});
  const bytes=encode(gates);
  for(let input=0;input<8;input++){
   const wires=[false,true,...Array.from({length:3},(_,i)=>Boolean(input&(1<<i)))];
   for(const g of gates)wires.push(!(wires[g.a]&&wires[g.b]));
   const [,actual]=await runtime.step(bytes,3,1,'0x',hexlify(Uint8Array.of(input)));
   assert.equal(actual,wires.at(-1)?'0x01':'0x00');
  }
 }
 const seq=encode([{op:1,a:4},{op:0,a:2,b:3}]);
 let state='0x';let stateBit=false;
 for(const input of [1,1,0,1,0,0,1,1]){
  const expected=!(Boolean(input)&&stateBit);
  const [next,output]=await runtime.step(seq,1,1,state,hexlify(Uint8Array.of(input)));
  assert.equal(output,expected?'0x01':'0x00');assert.equal(next,output);state=next;stateBit=expected;
 }
 const latch=encode([{op:1,a:2}]);
 assert.deepEqual(Array.from(await runtime.step(latch,1,1,'0x','0x01')),['0x01','0x00']);
 assert.deepEqual(Array.from(await runtime.step(latch,1,1,'0x01','0x00')),['0x00','0x01']);
 const dead=encode([{op:0,a:2,b:2},{op:0,a:3,b:3},{op:0,a:2,b:2}]);
 const metric=await runtime.metrics(dead,1,1);assert.equal(metric.depth,1n);assert.equal(metric.cost,3n);
 const lm=await runtime.metrics(latch,1,1);assert.equal(lm.area,7n);assert.equal(lm.burn,1n);assert.equal(lm.cost,7n);
 await assert.rejects(()=>runtime.metrics('0x0000',1,1));
 await assert.rejects(()=>runtime.metrics(encode([{op:0,a:3,b:2}]),1,1));
 await assert.rejects(()=>runtime.metrics(encode([{op:1,a:20}]),1,1));
 await assert.rejects(()=>runtime.step(latch,1,1,'0x','0x'));
 fs.writeFileSync('audit/runtime-local.json',JSON.stringify({environment:'local',randomCombinationalDesigns:24,truthTableEvaluations:192,sequentialCycles:8,checks:['little-endian bits','prior-state outputs','forward latch feedback','critical depth excluding dead NAND paths','area and burn','malformed input rejection'],REFSupported:false,referenceChainDifferentialVerified:false},null,2));
 console.log('PASS: persistent-runtime candidate, 192 combinational evaluations, sequential feedback, latch timing, metrics, malformed netlists. REF and chain parity remain unverified.');
}finally{await chain.disconnect();}
