// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRuntime.sol';

interface IROtapExecutable {
    function circuitInfo(uint256 id) external view returns(uint32,uint32,uint32,uint32);
    function circuitMetrics(uint256 id) external view returns(ROtapRuntime.Metrics memory);
    function eval(uint256 id,bytes calldata inputs) external view returns(bytes memory);
    function step(uint256 id,bytes calldata state,bytes calldata inputs) external view returns(bytes memory,bytes memory);
}

interface IROtapBatchExecutable {function runTask(uint256,uint32,bytes calldata) external view returns(bytes memory);}

/// Reference-verified task and Merkle proof candidate. Sampling integration is separate.
contract ROtapTaskRegistry {
    address public immutable owner;address public controller;bool public tasksFrozen;uint32 public taskCount;
    struct Task {string name;address referenceCircuits;uint256 referenceId;uint32 nIn;uint32 nOut;uint32 cycles;uint32 vectorCount;uint32 states;bytes32 vectorsRoot;uint256 refArea;uint256 refCost;bool active;}
    mapping(uint32=>Task) private tasks;
    event TaskAdded(uint32 indexed taskId,bytes32 vectorsRoot,address referenceCircuits,uint256 referenceId);
    constructor(){owner=msg.sender;}
    modifier onlyAdministrator(){require(msg.sender==(controller==address(0)?owner:controller),'AUTH');_;}
    function setController(address controller_) external {require(msg.sender==owner&&controller==address(0)&&controller_.code.length>0,'AUTH');controller=controller_;}
    function freezeTasks() external onlyAdministrator {tasksFrozen=true;}
    function getTask(uint32 taskId) public view returns(Task memory){require(taskId>0&&taskId<=taskCount,'TASK');return tasks[taskId];}
    function inspectNetlist(bytes calldata program,uint32 nIn,uint32 nOut) external pure returns(ROtapRuntime.Metrics memory){return ROtapRuntime.inspect(program,nIn,nOut);}
    function liveGateCount(bytes calldata program,uint32 nIn,uint32 nOut) external pure returns(uint32){return ROtapRuntime.liveGateCount(program,nIn,nOut);}
    function vectorLeaf(uint256 index,bytes memory input,bytes memory expected) public pure returns(bytes32){return keccak256(bytes.concat(keccak256(abi.encode(index,input,expected))));}
    function checkProof(bytes32 root,bytes32 leaf,bytes32[] calldata proof) public pure returns(bool){
        bytes32 node=leaf;for(uint256 i;i<proof.length;i++)node=node<proof[i]?keccak256(abi.encodePacked(node,proof[i])):keccak256(abi.encodePacked(proof[i],node));return node==root;
    }
    function publish(string calldata name,address referenceCircuits,uint256 referenceId,uint32 cycles,uint32 vectorCount,bytes32 root,uint32[] calldata indexes,bytes[] calldata inputs,bytes[] calldata expected,bytes32[][] calldata proofs) external returns(uint32 taskId){
        require(msg.sender==(controller==address(0)?owner:controller),'AUTH');require(cycles>0&&cycles<=256&&vectorCount>=3&&root!=bytes32(0),'CONFIG');
        require(indexes.length>=3&&indexes.length==inputs.length&&inputs.length==expected.length&&inputs.length==proofs.length,'SAMPLES');
        (uint32 nIn,uint32 nOut,uint32 states,)=IROtapExecutable(referenceCircuits).circuitInfo(referenceId);
        require(states>0||cycles==1,'CYCLES');
        ROtapRuntime.Metrics memory metrics=IROtapExecutable(referenceCircuits).circuitMetrics(referenceId);require(metrics.area>0&&metrics.cost>0,'REFERENCE');
        Task memory task=Task(name,referenceCircuits,referenceId,nIn,nOut,cycles,vectorCount,states,root,metrics.burn,metrics.cost,true);
        for(uint256 i;i<indexes.length;i++){
            require(indexes[i]<vectorCount,'INDEX');
            require(checkProof(root,vectorLeaf(indexes[i],inputs[i],expected[i]),proofs[i]),'PROOF');
            require(keccak256(execute(task,referenceCircuits,referenceId,inputs[i]))==keccak256(expected[i]),'REFERENCE_OUTPUT');
        }
        taskId=++taskCount;tasks[taskId]=task;emit TaskAdded(taskId,root,referenceCircuits,referenceId);
    }
    function updateTaskRef(uint32 taskId,address referenceCircuits,uint256 referenceId) external onlyAdministrator {
        require(!tasksFrozen,'FROZEN');Task storage task=tasks[taskId];require(taskId>0&&taskId<=taskCount,'TASK');if(referenceCircuits==address(0)){task.active=false;return;}(uint32 nIn,uint32 nOut,uint32 states,)=IROtapExecutable(referenceCircuits).circuitInfo(referenceId);require(nIn==task.nIn&&nOut==task.nOut&&(states>0)==(task.states>0),'SHAPE');task.referenceCircuits=referenceCircuits;task.referenceId=referenceId;task.active=true;
    }
    function verifyOfficial(uint32 taskId,address circuits,uint256 circuitId,uint32 index,bytes calldata input,bytes calldata expected,bytes32[] calldata proof) external view returns(bool){
        Task memory task=getTask(taskId);require(index<task.vectorCount&&checkProof(task.vectorsRoot,vectorLeaf(index,input,expected),proof),'PROOF');
        return keccak256(execute(task,circuits,circuitId,input))==keccak256(expected);
    }
    function matchesReference(uint32 taskId,address circuits,uint256 circuitId,bytes calldata input) external view returns(bool){
        Task memory task=getTask(taskId);return keccak256(execute(task,circuits,circuitId,input))==keccak256(execute(task,task.referenceCircuits,task.referenceId,input));
    }
    function execute(Task memory task,address circuits,uint256 circuitId,bytes memory input) private view returns(bytes memory result){
        (uint32 nIn,uint32 nOut,uint32 states,)=IROtapExecutable(circuits).circuitInfo(circuitId);
        require(nIn==task.nIn&&nOut==task.nOut&&(states>0)==(task.states>0),'SHAPE');
        uint256 inputSize=(uint256(nIn)+7)/8;uint256 outputSize=(uint256(nOut)+7)/8;
        require(input.length==inputSize*task.cycles,'INPUT_LENGTH');try IROtapBatchExecutable(circuits).runTask(circuitId,task.cycles,input) returns(bytes memory batched){require(batched.length==outputSize*task.cycles,'OUTPUT_LENGTH');return batched;}catch{}result=new bytes(outputSize*task.cycles);bytes memory state;
        for(uint256 cycle;cycle<task.cycles;cycle++){
            bytes memory vector=new bytes(inputSize);for(uint256 j;j<inputSize;j++)vector[j]=input[cycle*inputSize+j];
            bytes memory outputs;
            if(states==0)outputs=IROtapExecutable(circuits).eval(circuitId,vector);else(state,outputs)=IROtapExecutable(circuits).step(circuitId,state,vector);
            require(outputs.length==outputSize,'OUTPUT_LENGTH');for(uint256 j;j<outputSize;j++)result[cycle*outputSize+j]=outputs[j];
        }
    }
    function bonusOf(uint32 taskId,uint256 cost) external view returns(uint256){
        Task memory task=getTask(taskId);if(cost==0)return 0;uint256 value=task.refArea*task.refCost/cost;uint256 lower=(task.refArea+3)/4;uint256 upper=task.refArea*4;
        return value<lower?lower:value>upper?upper:value;
    }
}
