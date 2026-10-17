// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRuntime.sol';
import './ROtapTaskRegistry.sol';
interface IROtapSamplingCircuit {function circuitInfo(uint256) external view returns(uint32,uint32,uint32,uint32);function netlist(uint256) external view returns(bytes memory);}

/// Initial sampling parameters and hash encoding matched against original-chain traces.
/// Governance changes to sampling budgets still require reference verification.
contract ROtapSamplingPolicy {
    ROtapTaskRegistry public immutable registry;
    address public immutable owner;address public controller;bool public isSealed;
    uint256 public maxRunGas=12_000_000;
    uint256 public constant sampleGasBudget=8_000_000;
    uint32 public constant MIN_SAMPLES=3;
    uint32 public constant maxSamples=32;
    constructor(address registry_){require(registry_.code.length>0,'REGISTRY');registry=ROtapTaskRegistry(registry_);owner=msg.sender;}
    function setController(address controller_) external {require(msg.sender==owner&&controller==address(0)&&controller_.code.length>0,'AUTH');controller=controller_;}
    function raiseMaxRunGas(uint256 limit) external {require(msg.sender==(controller==address(0)?owner:controller)&&!isSealed&&limit>maxRunGas,'AUTH');maxRunGas=limit;}
    function seal() external {require(msg.sender==controller,'AUTH');isSealed=true;}
    function runGasFor(uint32 gates,uint32 cycles) public pure returns(uint256){return (50000+uint256(gates)*3000)*cycles;}
    function sampleCountFor(uint32 gates,uint32 cycles) public pure returns(uint32){
        require(cycles>0,'CYCLES');uint256 count=sampleGasBudget/runGasFor(gates,cycles);if(count>maxSamples)count=maxSamples;if(count<MIN_SAMPLES)count=MIN_SAMPLES;return uint32(count);
    }
    function checkBudget(uint32 gates,uint32 cycles,uint256 samples) external view returns(bool){return cycles>0&&samples>=MIN_SAMPLES&&samples<=maxSamples&&runGasFor(gates,cycles)*samples<=maxRunGas;}
    function indexes(bytes32 anchorHash,address circuits,uint256 circuitId,uint32 vectorCount,uint32 count) public pure returns(uint32[] memory result){
        require(vectorCount>0&&count>=MIN_SAMPLES&&count<=maxSamples,'CONFIG');result=new uint32[](count);
        for(uint32 i;i<count;i++)result[i]=uint32(uint256(keccak256(abi.encodePacked(anchorHash,circuits,circuitId,i)))%vectorCount);
    }
    function sampleIndexes(address circuits,uint256 circuitId,uint32 taskId,uint256 anchorBlock) external view returns(uint32[] memory){
        bytes32 anchorHash=blockhash(anchorBlock);require(anchorHash!=bytes32(0),'ANCHOR');ROtapTaskRegistry.Task memory task=registry.getTask(taskId);
        (uint32 nIn,uint32 nOut,,)=IROtapSamplingCircuit(circuits).circuitInfo(circuitId);bytes memory program=IROtapSamplingCircuit(circuits).netlist(circuitId);
        uint32 count=sampleCountFor(ROtapRuntime.liveGateCount(program,nIn,nOut),task.cycles);
        return indexes(anchorHash,circuits,circuitId,task.vectorCount,count);
    }
}
