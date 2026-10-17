import fs from 'node:fs';import assert from 'node:assert/strict';import solc from 'solc';import ganache from 'ganache';import {BrowserProvider,ContractFactory,parseEther} from 'ethers';
const names=['ROtapStakeBoost.sol','ROtapRewardStakeBoost.sol','ROtapContinuousLedger.sol'];
const mock=`pragma solidity ^0.8.24; interface IBoost {function factorBps(address) external view returns(uint256);} contract Sync {address public boost;uint256 public beforeFactor;uint256 public afterFactor;function configure(address b) external {require(boost==address(0));boost=b;}function beforeFactorChange(address a) external {require(msg.sender==boost);beforeFactor=IBoost(boost).factorBps(a);}function afterFactorChange(address a) external {require(msg.sender==boost);afterFactor=IBoost(boost).factorBps(a);}}`;
const sources=Object.fromEntries(names.map(n=>[n,{content:fs.readFileSync('contracts/'+n,'utf8')}]));sources['Sync.sol']={content:mock};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}})));
assert.equal((output.errors||[]).filter(e=>e.severity==='error').length,0,JSON.stringify(output.errors));
const dbPath='.test-chain/reward-stake-'+Date.now();fs.mkdirSync(dbPath,{recursive:true});const rpc=ganache.provider({database:{dbPath},logging:{quiet:true},miner:{timestampIncrement:0}});
try{
const provider=new BrowserProvider(rpc,undefined,{cacheTimeout:-1}),owner=await provider.getSigner(0),other=await provider.getSigner(1),account=await owner.getAddress(),otherAddress=await other.getAddress();
const deploy=async(file,name,args=[])=>{const a=output.contracts[file][name],c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c;};
const token=await deploy('ROtapContinuousLedger.sol','ROtapContinuousReward'),sync=await deploy('Sync.sol','Sync');
const boost=await deploy('ROtapRewardStakeBoost.sol','ROtapRewardStakeBoost',[await sync.getAddress(),[50,150,250,400,500],await token.getAddress()]);await(await sync.configure(await boost.getAddress())).wait();
const unit=100000000n,thresholds=[200n,600n,1000n,1500n,2000n],bonuses=[500n,700n,900n,1200n,1500n];
const referenceLabels=JSON.parse(fs.readFileSync('reference-v2/boost-tier-labels.json','utf8'));
const referenceResponses=JSON.parse(fs.readFileSync('reference-v2/boost-tier-results.json','utf8')).responses;
for(let i=0;i<referenceLabels.length;i++)if(referenceLabels[i][0]==='bemStakeBpsOf'){
 const response=referenceResponses.find(r=>r.id===i+1);assert.ok(response?.result,'Missing original-chain boost result');
 const amount=parseEther(referenceLabels[i][1]);
 assert.equal(await boost.rewardStakeBpsOf(amount),BigInt(response.result));
}
for(let i=0;i<5;i++){assert.equal(await boost.rewardStakeBpsOf(thresholds[i]*unit),bonuses[i]);assert.equal(await boost.rewardStakeBpsOf(thresholds[i]*unit-1n),i?bonuses[i-1]:0n);}
await(await token.mint(account,2500n*unit)).wait();await assert.rejects(()=>boost.stakeReward(600n*unit));await(await token.approve(await boost.getAddress(),2500n*unit)).wait();
await(await boost.stakeReward(600n*unit)).wait();assert.equal(await sync.beforeFactor(),10000n);assert.equal(await sync.afterFactor(),10700n);
await(await boost.stake({value:500})).wait();assert.equal(await boost.factorBps(account),12200n);
await(await boost.unstakeReward(401n*unit)).wait();assert.equal(await sync.beforeFactor(),12200n);assert.equal(await sync.afterFactor(),11500n);
const first=(await boost.rewardUnstaking(account)).unlockAt;await assert.rejects(()=>boost.withdrawReward(account));
await rpc.request({method:'evm_increaseTime',params:[86400]});await rpc.request({method:'evm_mine',params:[]});await(await boost.unstakeReward(unit)).wait();
assert.equal((await boost.rewardUnstaking(account)).unlockAt-first,86400n);assert.equal((await boost.rewardUnstaking(account)).amount,402n*unit);
assert.equal(await token.balanceOf(await boost.getAddress()),await boost.totalRewardStaked()+await boost.totalRewardUnstaking());
await rpc.request({method:'evm_increaseTime',params:[604800]});await rpc.request({method:'evm_mine',params:[]});
const before=await token.balanceOf(account);await(await boost.connect(other).withdrawReward(account)).wait();assert.equal((await token.balanceOf(account))-before,402n*unit);assert.equal(await token.balanceOf(otherAddress),0n);
assert.equal(await boost.totalRewardUnstaking(),0n);assert.equal(await token.balanceOf(await boost.getAddress()),198n*unit);await assert.rejects(()=>boost.withdrawReward(account));
fs.writeFileSync('audit/reward-stake-local.json',JSON.stringify({environment:'local',assetAdaptation:'BEM replaced with ROTAP by user instruction',tiers:thresholds.map(String),decimals:8,boostBps:bonuses.map(String),withdrawalDelay:604800,checks:['all tier boundaries','allowance enforcement','settlement hooks before and after factor changes','native and ROTAP additive factor','immediate factor reduction on unstake','repeated exit merges and resets timer','principal conservation','third-party withdrawal pays beneficiary only','no double withdrawal'],referenceWholeProtocolParity:false},null,2));
console.log('PASS: ROTAP staking tiers, settlement hooks, native combination, seven-day exit, exact principal and beneficiary-only payout.');
}finally{await rpc.disconnect();}

