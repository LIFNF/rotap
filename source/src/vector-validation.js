import {AbiCoder,keccak256,concat} from 'ethers';
import {bytes,createRunner} from './netlist.js';

export function validateOfficialVectors(task,program,file,expectedChainId=4663){
 if(Number(file.chainId)!==expectedChainId||Number(file.taskId)!==task.taskId||file.root.toLowerCase()!==task.vectorsRoot.toLowerCase()||file.vectors?.length!==task.vectorCount)throw Error('官方向量数据与任务不一致');
 const run=createRunner(program,task.nIn,task.nOut),coder=AbiCoder.defaultAbiCoder(),seen=new Set(),inputSize=Math.ceil(task.nIn/8),outputSize=Math.ceil(task.nOut/8);
 for(const vector of file.vectors){
  if(!Number.isInteger(vector.index)||vector.index<0||vector.index>=task.vectorCount||seen.has(vector.index))throw Error('官方向量索引无效');seen.add(vector.index);
  let digest=keccak256(keccak256(coder.encode(['uint256','bytes','bytes'],[vector.index,vector.input,vector.expectedOut])));
  for(const sibling of vector.proof)digest=keccak256(concat(BigInt(digest)<BigInt(sibling)?[digest,sibling]:[sibling,digest]));
  if(digest.toLowerCase()!==task.vectorsRoot.toLowerCase())throw Error('官方向量证明不匹配');
  const input=bytes(vector.input);if(input.length!==inputSize*task.cycles||bytes(vector.expectedOut).length!==outputSize*task.cycles)throw Error('官方向量长度无效');
  let state='0x',actual='0x';for(let cycle=0;cycle<task.cycles;cycle++){const result=run(state,input.subarray(cycle*inputSize,(cycle+1)*inputSize));state=result.state;actual+=result.output.slice(2);}
  if(actual.toLowerCase()!==vector.expectedOut.toLowerCase())return {pass:false,index:vector.index,actual,expected:vector.expectedOut,input:vector.input,checked:seen.size};
 }
 return {pass:true,checked:seen.size};
}
