import fs from 'node:fs';import {Interface} from 'ethers';
const mining='0x4f6a2312d80753bdafd35ddb1bf4bb14c43f8265',lens='0xE566F9F6F20C19e2AfbD0BB9028A2517d55Bf5F5',circuits='0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6',block='0x45ff3fb';
const make=file=>new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/'+file+'.json','utf8'))),mi=make('podMining'),li=make('podLens'),ci=make('circuits');
const queries=[],labels=[];const add=(address,iface,name,args)=>{labels.push(name+JSON.stringify(args));queries.push({jsonrpc:'2.0',id:queries.length+1,method:'eth_call',params:[{to:address,data:iface.encodeFunctionData(name,args)},block]});};
for(const args of [[27,72],[27,1],[1,1],[1,100000]])add(mining,mi,'bonusOf',args);
for(const args of [[1,2],[1,10],[100,2],[100,10],[0,1]])add(mining,mi,'runGasFor',args);
add(circuits,ci,'nextId',[]);add(circuits,ci,'ownerOf',[0]);add(circuits,ci,'ownerOf',[1]);
add(lens,li,'sampleIndexes',[circuits,1,1,Number(BigInt(block)-1n)]);
fs.writeFileSync('reference-v2/parameter-read-requests.json',JSON.stringify(queries,(_,x)=>typeof x==='bigint'?x.toString():x));fs.writeFileSync('reference-v2/parameter-read-labels.json',JSON.stringify(labels));
