import fs from 'node:fs';import assert from 'node:assert/strict';import {AbiCoder,keccak256,concat} from 'ethers';
import {bytes,metrics,createRunner} from '../src/netlist.js';
const bank=JSON.parse(fs.readFileSync('reference-v2/taskbank-with-netlists.json','utf8')),coder=AbiCoder.defaultAbiCoder();
const results=[];let total=0;
for(const task of bank.tasks){
 const file=JSON.parse(fs.readFileSync('reference-v2/official-vectors/task-'+task.taskId+'.json','utf8'));
 assert.equal(Number(file.chainId),196);assert.equal(Number(file.taskId),task.taskId);assert.equal(file.root.toLowerCase(),task.vectorsRoot.toLowerCase());assert.equal(file.vectors.length,task.vectorCount);
 const circuit=createRunner(task.referenceNetlist,task.nIn,task.nOut),seen=new Set(),inputSize=Math.ceil(task.nIn/8),outputSize=Math.ceil(task.nOut/8);
 for(const vector of file.vectors){
  assert.ok(Number.isInteger(vector.index)&&vector.index>=0&&vector.index<task.vectorCount&&!seen.has(vector.index),'Duplicate or invalid vector index');seen.add(vector.index);
  let node=keccak256(keccak256(coder.encode(['uint256','bytes','bytes'],[vector.index,vector.input,vector.expectedOut])));
  for(const sibling of vector.proof)node=keccak256(concat(BigInt(node)<BigInt(sibling)?[node,sibling]:[sibling,node]));assert.equal(node.toLowerCase(),task.vectorsRoot.toLowerCase(),'Invalid official proof: '+task.taskId+'/'+vector.index);
  const input=bytes(vector.input),expected=bytes(vector.expectedOut);assert.equal(input.length,inputSize*task.cycles);assert.equal(expected.length,outputSize*task.cycles);
  let state='0x',actual='0x';for(let cycle=0;cycle<task.cycles;cycle++){const result=circuit(state,input.subarray(cycle*inputSize,(cycle+1)*inputSize));state=result.state;actual+=result.output.slice(2);}
  assert.equal(actual.toLowerCase(),vector.expectedOut.toLowerCase(),'Reference output mismatch: '+task.taskId+'/'+vector.index);total++;
 }
 const measured=metrics(task.referenceNetlist,task.nIn,task.nOut);assert.equal(measured.burn.toString(),task.refArea);assert.equal(measured.cost.toString(),task.refCost);
 results.push({taskId:task.taskId,vectors:file.vectors.length,rootVerified:true,referenceExecutionMatched:true});
 if(task.taskId%10===0)console.log('Verified official roots and reference execution: '+task.taskId+'/100');
}
fs.writeFileSync('audit/official-vector-verification.json',JSON.stringify({chainId:196,block:bank.block,tasks:results.length,vectors:total,allRootsVerified:true,allReferenceExecutionsMatched:true,scope:'Official vector integrity and NAND/LATCH reference execution, not complete protocol parity',results},null,2));
console.log('PASS: '+results.length+' original tasks, '+total+' official vector proofs and reference executions matched.');
