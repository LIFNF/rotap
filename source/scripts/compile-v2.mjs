import fs from 'node:fs';
import solc from 'solc';
import {keccak256,toUtf8Bytes} from 'ethers';
const names=['ROtapRuntime.sol','ROtapTransistors.sol','ROtapCircuits.sol','ROtapReferenceRuntime.sol','ROtapContinuousLedger.sol','ROtapStakeBoost.sol','ROtapRewardStakeBoost.sol','ROtapBoost.sol','ROtapSamplingPolicy.sol','ROtapTaskRegistry.sol','ROtapMining.sol','ROtapMarkets.sol','ROtapAccounts.sol','ROtapProcessorFactory.sol'];
const sources=Object.fromEntries(names.map(name=>[name,{content:fs.readFileSync('contracts/'+name,'utf8')}]));
const settings={optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}};
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings}),{import:name=>{try{return {contents:fs.readFileSync('node_modules/'+name,'utf8')}}catch{return {error:'Import unavailable: '+name}}}}));
const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
const contracts={};fs.mkdirSync('candidate-v2',{recursive:true});
for(const [file,items] of Object.entries(output.contracts))for(const [name,artifact] of Object.entries(items)){
 if(!artifact.evm.bytecode.object||!name.startsWith('ROtap')||name.endsWith('Harness')||['ROtapRuntime','ROtapReferenceRuntime','ROtapMetadata','ROtapEmission'].includes(name))continue;
 const creation=artifact.evm.bytecode.object,runtime=artifact.evm.deployedBytecode.object;
 if(runtime.length/2>24576||creation.length/2>49152)throw Error('Deployment size limit: '+name);
 fs.writeFileSync('candidate-v2/'+name+'.json',JSON.stringify({candidate:true,deploymentAllowed:false,source:file,abi:artifact.abi,bytecode:'0x'+creation,runtimeTemplate:'0x'+runtime,immutableReferences:artifact.evm.deployedBytecode.immutableReferences},null,2));
 contracts[name]={source:file,creationBytes:creation.length/2,runtimeBytes:runtime.length/2,creationCodeHash:keccak256('0x'+creation)};
}
const manifest={status:'candidate-not-for-deployment',deploymentAllowed:false,compiler:solc.version(),settings,sourceHashes:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,keccak256(toUtf8Bytes(s.content))])),contracts,remaining:['exact-release acceptance evidence','independent third-party review','mainnet funding and deployment','explorer source verification']};
fs.writeFileSync('candidate-v2/manifest.json',JSON.stringify(manifest,null,2));console.log('Compiled '+Object.keys(contracts).length+' candidate contracts; size limits passed. Deployment remains blocked.');
