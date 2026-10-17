import fs from 'node:fs';import {AbiCoder,keccak256,solidityPacked,solidityPackedKeccak256} from 'ethers';
const traces=JSON.parse(fs.readFileSync('audit/reference-sampling-inference.json','utf8')).traces,coder=AbiCoder.defaultAbiCoder(),circuits='0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6';
const perm=items=>items.length?items.flatMap((item,i)=>perm(items.filter((_,j)=>j!==i)).map(tail=>[item,...tail])):[[]];
const layouts=[...perm(['hash','circuits','id']),...perm(['hash','key']),...perm(['hash','key','anchor']),...perm(['hash','circuits','id','anchor'])];
const matches=[];
for(const packed of [true,false])for(const idType of ['uint256','uint64'])for(const counterType of ['uint256','uint32','uint8','uint64'])for(const layout of layouts)for(const mode of ['direct','seeded'])for(const first of [false,true])for(const offset of [0,1]){
 let valid=true;let bytePosition=null;
 for(const trace of traces){
  const values={hash:trace.hash,circuits,id:trace.circuitId,anchor:trace.anchor,key:solidityPackedKeccak256(['address','uint256'],[circuits,trace.circuitId])},types={hash:'bytes32',circuits:'address',id:idType,anchor:'uint256',key:'bytes32'};
  const encode=(t,v)=>packed?solidityPacked(t,v):coder.encode(t,v),seed=keccak256(encode(layout.map(k=>types[k]),layout.map(k=>values[k])));
  let possible=Array.from({length:32},(_,i)=>i);
  for(let index=0;index<trace.indexes.length;index++){
   let digest;if(mode==='direct'){const keys=first?['counter',...layout]:[...layout,'counter'],v={...values,counter:index+offset},t={...types,counter:counterType};digest=keccak256(encode(keys.map(k=>t[k]),keys.map(k=>v[k])));}else digest=keccak256(first?encode([counterType,'bytes32'],[index+offset,seed]):encode(['bytes32',counterType],[seed,index+offset]));
   possible=possible.filter(pos=>parseInt(digest.slice(2+pos*2,4+pos*2),16)===trace.indexes[index]);if(!possible.length)break;
  }
  if(!possible.length||(bytePosition!==null&&!possible.includes(bytePosition))){valid=false;break;}bytePosition=possible[0];
 }
 if(valid)matches.push({packed,idType,counterType,layout,mode,first,offset,bytePosition});
}
fs.writeFileSync('audit/reference-sampling-extended.json',JSON.stringify({traces:traces.length,matches},null,2));console.log(JSON.stringify({traces:traces.length,matches}));
