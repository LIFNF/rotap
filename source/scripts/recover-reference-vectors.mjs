import fs from 'node:fs';import {AbiCoder,keccak256,concat} from 'ethers';
import {step,hex,bytes} from '../src/netlist.js';
const bank=JSON.parse(fs.readFileSync('reference-v2/taskbank-with-netlists.json','utf8'));const coder=AbiCoder.defaultAbiCoder();
const pair=(a,b)=>keccak256(concat(BigInt(a)<BigInt(b)?[a,b]:[b,a]));
const encode=(value,nIn)=>{const out=new Uint8Array(Math.ceil(nIn/8)),masked=value&((1n<<BigInt(nIn))-1n);for(let i=0;i<out.length;i++)out[i]=Number(masked>>BigInt(i*8)&255n);return hex(out);};
function tree(vectors){const ordered=vectors.map((v,index)=>({index,hash:keccak256(keccak256(coder.encode(['uint256','bytes','bytes'],[index,v.input,v.expectedOut])))})).sort((a,b)=>a.hash.localeCompare(b.hash));const layers=[ordered.map(x=>x.hash)];while(layers.at(-1).length>1){const previous=layers.at(-1),next=[];for(let i=0;i<previous.length;i+=2)next.push(pair(previous[i],previous[i+1]));layers.push(next);}return {root:layers.at(-1)[0],proofs:vectors.map((_,index)=>{let position=ordered.findIndex(x=>x.index===index);const proof=[];for(const layer of layers.slice(0,-1)){proof.push(layer[position^1]);position>>=1;}return proof;})};}
function vectorsFor(task,pattern){return Array.from({length:task.vectorCount},(_,index)=>{let state='0x',input='0x',expectedOut='0x';for(let cycle=0;cycle<task.cycles;cycle++){let value;if(pattern==='constant')value=BigInt(index);else if(pattern==='increment')value=BigInt(index+cycle);else if(pattern==='shift')value=BigInt(index)>>BigInt(cycle);else if(pattern==='repeat8')value=BigInt(index)>>BigInt(cycle%8);else throw Error('Pattern');const frame=encode(value,task.nIn),next=step(task.referenceNetlist,task.nIn,task.nOut,state,frame);input+=frame.slice(2);expectedOut+=next.output.slice(2);state=next.state;}return {index,input,expectedOut};});}
fs.mkdirSync('reference-v2/vectors',{recursive:true});const report=[];
for(const task of bank.tasks){
 const patterns=task.kind===0?['constant']:task.taskId===27?['constant','increment','shift','repeat8']:[];let matched=false;
 for(const pattern of patterns){const vectors=vectorsFor(task,pattern),built=tree(vectors);if(built.root.toLowerCase()!==task.vectorsRoot.toLowerCase())continue;
  fs.writeFileSync('reference-v2/vectors/task-'+task.taskId+'.json',JSON.stringify({chainId:196,block:bank.block,taskId:task.taskId,root:built.root,pattern,rootVerified:true,vectors:vectors.map((v,i)=>({...v,proof:built.proofs[i]}))},null,2));matched=true;console.log('Matched official root: task '+task.taskId+' '+pattern);break;
 }
 report.push({taskId:task.taskId,kind:task.kind,matched,patternsTried:patterns});
}
fs.writeFileSync('audit/vector-recovery.json',JSON.stringify({chainId:196,block:bank.block,matchedTasks:report.filter(x=>x.matched).length,totalTasks:bank.tasks.length,allRootsVerified:report.every(x=>x.matched),tasks:report},null,2));
console.log('Official roots recovered: '+report.filter(x=>x.matched).length+'/'+bank.tasks.length);
