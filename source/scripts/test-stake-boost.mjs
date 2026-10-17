import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory} from 'ethers';
const mock=`pragma solidity ^0.8.24; interface IBoost {function factorBps(address) external view returns(uint256);} contract Sync {address public boost;uint256 public beforeFactor;uint256 public afterFactor;function configure(address b) external {require(boost==address(0));boost=b;}function beforeFactorChange(address a) external {require(msg.sender==boost);beforeFactor=IBoost(boost).factorBps(a);}function afterFactorChange(address a) external {require(msg.sender==boost);afterFactor=IBoost(boost).factorBps(a);}}`;
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Boost.sol':{content:fs.readFileSync('contracts/ROtapStakeBoost.sol','utf8')},'Sync.sol':{content:mock}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((output.errors||[]).filter(e=>e.severity==='error').length,0,JSON.stringify(output.errors));
const dbPath='.test-chain/stake-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true},miner:{timestampIncrement:0}});
try{
 const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}),owner=await provider.getSigner(0),other=await provider.getSigner(1),address=await owner.getAddress();
 const deploy=async(file,name,args=[])=>{const a=output.contracts[file][name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
 const sync=await deploy('Sync.sol','Sync');const boost=await deploy('Boost.sol','ROtapStakeBoost',[await sync.getAddress(),[100,300,500,800,1000]]);await(await sync.configure(await boost.getAddress())).wait();
 await(await boost.stake({value:300})).wait();assert.equal(await sync.beforeFactor(),10000n);assert.equal(await sync.afterFactor(),10700n);
 await(await boost.unstake(220)).wait();assert.equal(await sync.beforeFactor(),10700n);assert.equal(await sync.afterFactor(),10000n);
 const first=(await boost.unstaking(address)).unlockAt;
 await assert.rejects(()=>boost.withdraw(address));await assert.rejects(()=>boost.connect(other).withdraw(address));
 await rpc.request({method:'evm_increaseTime',params:[86400]});await rpc.request({method:'evm_mine',params:[]});
 await(await boost.unstake(10)).wait();const exit=await boost.unstaking(address);assert.equal(exit.amount,230n);assert.equal(exit.unlockAt-first,86400n);
 assert.equal(await provider.getBalance(await boost.getAddress()),(await boost.totalStaked())+(await boost.totalUnstaking()));
 await rpc.request({method:'evm_increaseTime',params:[604800]});await rpc.request({method:'evm_mine',params:[]});
 const before=await provider.getBalance(address);const receipt=await(await boost.withdraw(address)).wait();const after=await provider.getBalance(address);
 assert.equal(after-before+receipt.fee,230n);assert.equal(await boost.totalUnstaking(),0n);assert.equal(await boost.staked(address),70n);
 assert.equal(await provider.getBalance(await boost.getAddress()),70n);
 fs.writeFileSync('audit/stake-boost-local.json',JSON.stringify({environment:'local',checks:['pre-change settlement hook','post-change factor hook','stake tiers','immediate unstake factor drop','7-day exit','repeated unstake resets timer','principal and gas-reconciled payout'],ETHThresholdsFinalized:false,BEMStakingImplemented:false,referenceChainParityVerified:false},null,2));
 console.log('PASS: native stake candidate, factor settlement hooks, tier changes, delayed withdrawal, merged exit resets and exact principal payout. BEM and final ETH thresholds pending.');
}finally{await rpc.disconnect();}
