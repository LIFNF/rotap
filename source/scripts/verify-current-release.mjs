import fs from 'node:fs';import assert from 'node:assert/strict';import {retiredAssets} from './remove-legacy-assets.mjs';
const release=JSON.parse(fs.readFileSync('dist/release.json','utf8')),network=JSON.parse(fs.readFileSync('dist/network.json','utf8'));
assert.equal(release.protocolVersion,2);assert.equal(network.protocolVersion,2);assert.equal(release.taskCount,100);assert.equal(release.deploymentBlocked,!fs.existsSync('config/deployment.json'));if(!release.deploymentBlocked){const d=JSON.parse(fs.readFileSync('config/deployment.json'));assert.equal(d.verified,true);assert.equal(release.releaseId,d.releaseId);assert.equal(network.miningAddress,d.addresses.miningAddress);}
for(const key of ['epochDuration','epochReward','rewardEpochs','tasks'])assert.equal(key in release,false,'Retired release field: '+key);
for(const file of retiredAssets)assert.equal(fs.existsSync('dist/'+file),false,'Retired asset present: '+file);
for(const file of ['app.js','launch.js','launch.html'])assert.doesNotMatch(fs.readFileSync('dist/'+file,'utf8'),/claimStarter|currentEpoch|circuitEpochActive|mintCircuit|commitCircuit|登记下一周期|固定周期奖池|四项任务|EPOCH BASED/,'Retired flow present in '+file);
console.log('PASS: release contains only current protocol configuration and no retired deployment assets or calls.');
