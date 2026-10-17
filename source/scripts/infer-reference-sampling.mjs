import fs from 'node:fs';import {AbiCoder,Interface,keccak256,solidityPacked} from 'ethers';
const labels=JSON.parse(fs.readFileSync('reference-v2/sampling-read-labels.json','utf8')),raw=JSON.parse(fs.readFileSync('reference-v2/sampling-read-results.json','utf8')).responses,iface=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/podLens.json','utf8'))),coder=AbiCoder.defaultAbiCoder();
const traces=[];for(const response of raw){const label=labels[response.id-1];if(label.kind!=='sample'||label.taskId!==1||!response.result||response.result==='0x')continue;const block=raw.find(r=>labels[r.id-1].kind==='block'&&labels[r.id-1].anchor===label.anchor);traces.push({...label,hash:block.result.hash,indexes:Array.from(iface.decodeFunctionResult('sampleIndexes',response.result)[0]).map(Number)});}
const circuits='0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6';
const permutations=arr=>arr.length?arr.flatMap((item,i)=>permutations(arr.filter((_,j)=>j!==i)).map(rest=>[item,...rest])):[[]];
const matches=[];
for(const packed of [true,false])for(const mode of ['direct','seeded'])for(const layout of permutations(['hash','circuits','id']))for(const counterFirst of [false,true])for(const offset of [0,1]){
 let valid=true;
 for(const trace of traces){
  const values={hash:trace.hash,circuits,id:trace.circuitId},types={hash:'bytes32',circuits:'address',id:'uint256'};
  const encode=(t,v)=>packed?solidityPacked(t,v):coder.encode(t,v);
  const seed=keccak256(encode(layout.map(x=>types[x]),layout.map(x=>values[x])));
  for(let index=0;index<trace.indexes.length;index++){
   let digest;if(mode==='direct'){const l=counterFirst?['counter',...layout]:[...layout,'counter'];const vv={...values,counter:index+offset},tt={...types,counter:'uint256'};digest=keccak256(encode(l.map(x=>tt[x]),l.map(x=>vv[x])));}
   else digest=keccak256(counterFirst?encode(['uint256','bytes32'],[index+offset,seed]):encode(['bytes32','uint256'],[seed,index+offset]));
   if(Number(BigInt(digest)%256n)!==trace.indexes[index]){valid=false;break;}
  }if(!valid)break;
 }
 if(valid)matches.push({packed,mode,layout,counterFirst,offset,traces:traces.length});
}
fs.writeFileSync('audit/reference-sampling-inference.json',JSON.stringify({traces,matches,scope:'Black-box inference; more anchors and vector counts required before release'},null,2));console.log(JSON.stringify({traces:traces.length,matches}));
