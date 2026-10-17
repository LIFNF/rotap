import fs from 'node:fs';import {Interface,hexlify} from 'ethers';
const bank=JSON.parse(fs.readFileSync('reference-v2/taskbank-with-netlists.json','utf8'));
const iface=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/circuits.json','utf8')));
let seed=7513;const randomByte=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed&255;};
const cases=[];
for(const task of bank.tasks){
 const bytes=Buffer.from(task.referenceNetlist.slice(2),'hex');let states=0,nand=0;
 for(let pos=0;pos<bytes.length;){if(bytes[pos]===0){nand++;pos+=7;}else if(bytes[pos]===1){states++;pos+=4;}else throw Error('Unsupported reference opcode in '+task.taskId);}
 for(let index=0;index<3;index++){
  const input=hexlify(Uint8Array.from({length:Math.ceil(task.nIn/8)},()=>randomByte()));
  const state=index===0?'0x':hexlify(Uint8Array.from({length:Math.ceil(states/8)},()=>randomByte()));
  const method=task.kind===0?'eval':'step',args=task.kind===0?[task.refCircuitId,input]:[task.refCircuitId,state,input];
  cases.push({taskId:task.taskId,index,nand,states,input,state,method,params:[{to:task.refCircuits,data:iface.encodeFunctionData(method,args)},bank.block]});
 }
}
fs.writeFileSync('reference-v2/runtime-reference-cases.json',JSON.stringify(cases,null,2));console.log(JSON.stringify(cases));
