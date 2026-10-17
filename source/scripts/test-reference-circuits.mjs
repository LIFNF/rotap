import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory,Contract,Interface,concat,zeroPadValue,toBeHex,getBytes,hexlify} from 'ethers';
const names=['ROtapRuntime.sol','ROtapReferenceRuntime.sol','ROtapCircuits.sol','ROtapTransistors.sol'];
const sources=Object.fromEntries(names.map(name=>[name,{content:fs.readFileSync('contracts/'+name,'utf8')}]));
sources['Registry.sol']={content:`pragma solidity ^0.8.24;import './ROtapCircuits.sol';contract Registry {mapping(address=>bool) public isCPU;address[] public cpus;function create(bytes memory initcode) external {address cpu;assembly ("memory-safe"){cpu:=create(0,add(initcode,32),mload(initcode))}require(cpu!=address(0));isCPU[cpu]=true;cpus.push(cpu);}}`};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((output.errors||[]).filter(e=>e.severity==='error').length,0,JSON.stringify(output.errors));
const dbPath='.test-chain/ref-circuits-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true}});
try{
const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}),owner=await provider.getSigner(),address=await owner.getAddress();
const deploy=async(file,name,args=[])=>{const a=output.contracts[file][name],c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
const registry=await deploy('Registry.sol','Registry');const creation=await new ContractFactory(output.contracts['ROtapCircuits.sol'].ROtapCircuits.abi,output.contracts['ROtapCircuits.sol'].ROtapCircuits.evm.bytecode.object,owner).getDeployTransaction(address,0,0,0);await(await registry.create(creation.data)).wait();const circuitAbi=output.contracts['ROtapCircuits.sol'].ROtapCircuits.abi,base=new Contract(await registry.cpus(0),circuitAbi,owner);
const materials=new Contract(await base.transistors(),output.contracts['ROtapTransistors.sol'].ROtapTransistors.abi,owner);await(await materials.mint(0,100)).wait();await(await materials.mint(1,100)).wait();
const refRead=JSON.parse(fs.readFileSync('reference-v2/sampling-circuit-results.json')).responses,refAbi=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/circuits.json')));
const andProgram=refAbi.decodeFunctionResult('netlist',refRead.find(r=>r.id===2).result)[0],delayProgram=refAbi.decodeFunctionResult('netlist',refRead.find(r=>r.id===4).result)[0];
const andId=(await base.nextId())+1n;await(await base.tapeout(andProgram,2,1)).wait();const delayId=(await base.nextId())+1n;await(await base.tapeout(delayProgram,1,1)).wait();
const rewrite=encoded=>{const bytes=getBytes(encoded);let pos=0;while(pos<bytes.length){const op=bytes[pos++];if(op===0)pos+=6;else if(op===1)pos+=3;else{const id=BigInt(hexlify(bytes.slice(pos+20,pos+28)));bytes.set(getBytes(base.target),pos);bytes.set(getBytes(zeroPadValue(toBeHex(id===4928n?andId:delayId),8)),pos+20);pos+=30+bytes[pos+28]*3;}}return hexlify(bytes);};
const cases=JSON.parse(fs.readFileSync('reference-v2/ref-probe-cases.json')),responses=JSON.parse(fs.readFileSync('reference-v2/ref-probe-results.json')).responses,probe=new Interface(JSON.parse(fs.readFileSync('reference-v2/ref-probe-helper.json')).abi);let matched=0;
for(let index=0;index<cases.length;index++){const c=cases[index],reference=responses.find(r=>r.id===index+1),program=rewrite(c.program);
 if(reference.error){await assert.rejects(()=>base.tapeout(program,c.ni,c.no));continue;}
 const expected=probe.decodeFunctionResult('probe',reference.result),id=(await base.nextId())+1n,nandBefore=await materials.balanceOf(address,0),latchBefore=await materials.balanceOf(address,1);
 await(await base.tapeout(program,c.ni,c.no)).wait();const info=await base.circuitInfo(id),actual=await base.step(id,c.state,c.input);
 assert.equal(info[2],expected[0],c.name+' state count');assert.equal(info[3],expected[1],c.name+' expanded gate count');assert.equal(actual[0],expected[2],c.name+' next state');assert.equal(actual[1],expected[3],c.name+' output');
 assert.equal(await base.hasReferences(id),true);await assert.rejects(()=>base.circuitMetrics(id));
 const ownLatch=c.name==='latch-then-ref'||c.name==='ref-then-latch'?1n:0n;assert.equal(nandBefore-await materials.balanceOf(address,0),0n);assert.equal(latchBefore-await materials.balanceOf(address,1),ownLatch);
 if(expected[0]===0n)assert.equal(await base.eval(id,c.input),expected[3]);else await assert.rejects(()=>base.eval(id,c.input));matched++;
}
const ref=(target,id,nIn,nOut,inputs)=>concat(['0x02',target,zeroPadValue(toBeHex(id),8),toBeHex(nIn,1),toBeHex(nOut,1),...inputs.map(i=>zeroPadValue(toBeHex(i),3))]);
const twoOutProgram=concat([ref(base.target,delayId,1,1,[2]),ref(base.target,delayId,1,1,[3])]);const twoOutId=(await base.nextId())+1n;await(await base.tapeout(twoOutProgram,2,2)).wait();
const nestedId=(await base.nextId())+1n;await(await base.tapeout(ref(base.target,twoOutId,2,2,[2,3]),2,2)).wait();assert.deepEqual(Array.from(await base.step(nestedId,'0x02','0x01')),['0x01','0x02']);assert.equal((await base.circuitInfo(nestedId))[3],6n);
await assert.rejects(()=>base.tapeout(ref(address,0,1,1,[2]),1,1));await assert.rejects(()=>base.tapeout(ref(base.target,delayId,2,1,[2,3]),2,1));await assert.rejects(()=>base.tapeout('0x02',1,1));
fs.writeFileSync('audit/reference-circuit-comparison.json',JSON.stringify({environment:'local with pinned original-chain simulation fixtures',originalBlock:'0x45ff3fb',matchedOriginalCases:matched,checks:['registered target CPU','expanded transitive gate and state counts','ordered packed state across REF and LATCH','mixed local material burn only','future REF input rejected','pure REF uses no material','nested multi-output REF','invalid shape and truncated REF rejected','REF mining metrics unavailable'],wholeProtocolEquivalent:false},null,2));
console.log('PASS: '+matched+' original REF simulations matched; nested multi-output circuits, registered targets, ordered state packing, exact local burn and mining exclusion.');
}finally{await rpc.disconnect();}
