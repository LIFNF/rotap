import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory,Contract,AbiCoder,keccak256,concat} from 'ethers';
const names=['ROtapRuntime.sol','ROtapTransistors.sol','ROtapCircuits.sol','ROtapReferenceRuntime.sol','ROtapTaskRegistry.sol'];
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:Object.fromEntries(names.map(name=>[name,{content:fs.readFileSync('contracts/'+name,'utf8')}])),settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((output.errors||[]).filter(x=>x.severity==='error').length,0,JSON.stringify(output.errors));
const dbPath='.test-chain/tasks-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true}});
try{
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}),owner=await provider.getSigner(),address=await owner.getAddress();
 const deploy=async(file,name,args=[])=>{const a=output.contracts[file][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
 const circuits=await deploy('ROtapCircuits.sol','ROtapCircuits',[address,0,0,0]);const materials=new Contract(await circuits.transistors(),output.contracts['ROtapTransistors.sol'].ROtapTransistors.abi,owner);
 await(await materials.mint(0,2)).wait();await(await circuits.tapeout('0x00000002000002',1,1)).wait();await(await circuits.tapeout('0x00000001000001',1,1)).wait();
 const registry=await deploy('ROtapTaskRegistry.sol','ROtapTaskRegistry');
 const inputs=['0x00','0x01','0x00','0x01'],expected=['0x01','0x00','0x01','0x00'],indexes=[0,1,2,3];
 const leaf=(i,input,value)=>keccak256(keccak256(AbiCoder.defaultAbiCoder().encode(['uint256','bytes','bytes'],[i,input,value])));
 const pair=(a,b)=>keccak256(concat(BigInt(a)<BigInt(b)?[a,b]:[b,a]));
 const leaves=inputs.map((x,i)=>leaf(i,x,expected[i]));const left=pair(leaves[0],leaves[1]),right=pair(leaves[2],leaves[3]),root=pair(left,right);
 const proofs=leaves.map((x,i)=>[leaves[i^1],i<2?right:left]);
 await(await registry.publish('反相器',await circuits.getAddress(),1,1,4,root,indexes,inputs,expected,proofs)).wait();
 assert.equal(await registry.taskCount(),1n);
 assert.equal(await registry.verifyOfficial(1,await circuits.getAddress(),1,0,inputs[0],expected[0],proofs[0]),true);
 assert.equal(await registry.verifyOfficial(1,await circuits.getAddress(),2,0,inputs[0],expected[0],proofs[0]),false);
 await assert.rejects(()=>registry.verifyOfficial(1,circuits.target,1,1,inputs[0],expected[0],proofs[0]));
 assert.equal(await registry.matchesReference(1,await circuits.getAddress(),2,'0x00'),false);
 assert.equal(await registry.matchesReference(1,await circuits.getAddress(),2,'0x01'),true);
 assert.equal(await registry.bonusOf(1,1),1n);assert.equal(await registry.bonusOf(1,1000),1n);
 await assert.rejects(()=>registry.publish('错误参考',circuits.target,2,1,4,root,indexes,inputs,expected,proofs));
 await(await registry.freezeTasks()).wait();await assert.rejects(()=>registry.updateTaskRef(1,circuits.target,2));await(await registry.publish('冻结后追加',circuits.target,1,1,4,root,indexes,inputs,expected,proofs)).wait();assert.equal(await registry.taskCount(),2n);
 fs.writeFileSync('audit/task-registry-local.json',JSON.stringify({environment:'local',checks:['reference execution before task publication','indexed double-hash Merkle vectors','invalid proof rejection','official failed vector','counterexample against reference','frozen existing references with append-only task publication'],originalTaskBankImported:false,originalBonusFormulaConfirmed:false,anchorSamplingIntegrated:false},null,2));
 console.log('PASS: task candidate, verified reference publication, canonical vector proofs, failed official vector, counterexample and freeze. Original task data and sampling integration pending.');
}finally{await rpc.disconnect();}
