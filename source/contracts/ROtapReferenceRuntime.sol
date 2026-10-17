// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRuntime.sol';
interface IROtapCPURegistry {function isCPU(address target) external view returns(bool);}
interface IROtapReferencedCircuit {
    function circuitInfo(uint256 id) external view returns(uint32,uint32,uint32,uint32);
    function step(uint256 id,bytes calldata state,bytes calldata inputs) external view returns(bytes memory,bytes memory);
}
/// REF encoding and ordered state packing verified with original-chain read-only simulations.
library ROtapReferenceRuntime {
    struct Layout {uint32 nand;uint32 latch;uint32 states;uint32 gates;uint256 wires;bool hasRefs;}
    struct Reference {address target;uint64 id;uint8 nIn;uint8 nOut;uint32 states;uint32 gates;}
    function referenceAt(bytes memory program,uint256 pos,address registry) internal view returns(Reference memory r){
        require(pos+30<=program.length,'TRUNCATED_REF');uint160 target;
        for(uint256 i;i<20;i++)target=(target<<8)|uint8(program[pos+i]);r.target=address(target);
        for(uint256 i;i<8;i++)r.id=(r.id<<8)|uint8(program[pos+20+i]);
        r.nIn=uint8(program[pos+28]);r.nOut=uint8(program[pos+29]);require(pos+30+uint256(r.nIn)*3<=program.length,'TRUNCATED_REF');
        require(registry.code.length>0&&IROtapCPURegistry(registry).isCPU(r.target),'REF_UNREGISTERED');
        (uint32 inputs,uint32 outputs,uint32 states,uint32 gates)=IROtapReferencedCircuit(r.target).circuitInfo(r.id);
        require(inputs==r.nIn&&outputs==r.nOut,'REF_SHAPE');r.states=states;r.gates=gates;
    }
    function describe(bytes memory program,uint32 nIn,uint32 nOut,address registry) internal view returns(Layout memory l){
        l.wires=2+uint256(nIn);uint256 pos;
        while(pos<program.length){uint8 op=uint8(program[pos++]);
            if(op==0){require(pos+6<=program.length,'TRUNCATED');l.nand++;l.gates++;l.wires++;pos+=6;}
            else if(op==1){require(pos+3<=program.length,'TRUNCATED');l.latch++;l.states++;l.gates++;l.wires++;pos+=3;}
            else if(op==2){Reference memory r=referenceAt(program,pos,registry);l.hasRefs=true;l.states+=r.states;l.gates+=r.gates;l.wires+=r.nOut;pos+=30+uint256(r.nIn)*3;}
            else revert('UNSUPPORTED_OPCODE');
        }
        require(nOut>0&&nOut<=l.wires,'OUTPUTS');uint256 wire=2+uint256(nIn);pos=0;
        while(pos<program.length){uint8 op=uint8(program[pos++]);
            if(op==0){require(ROtapRuntime.u24(program,pos)<wire&&ROtapRuntime.u24(program,pos+3)<wire,'FORWARD_NAND');pos+=6;wire++;}
            else if(op==1){require(ROtapRuntime.u24(program,pos)<l.wires,'STATE_WIRE');pos+=3;wire++;}
            else{uint256 inputs=uint8(program[pos+28]);for(uint256 i;i<inputs;i++)require(ROtapRuntime.u24(program,pos+30+i*3)<wire,'REF_FUTURE_SIGNAL');wire+=uint8(program[pos+29]);pos+=30+inputs*3;}
        }
    }
    function run(bytes memory program,uint32 nIn,uint32 nOut,bytes memory state,bytes memory inputs,address registry) internal view returns(bytes memory next,bytes memory outputs){
        Layout memory l=describe(program,nIn,nOut,registry);require(inputs.length==(uint256(nIn)+7)/8,'INPUT_LENGTH');require(state.length==0||state.length==(uint256(l.states)+7)/8,'STATE_LENGTH');
        bool[] memory wires=new bool[](l.wires);wires[1]=true;for(uint256 i;i<nIn;i++)wires[2+i]=ROtapRuntime.bit(inputs,i);
        next=new bytes((uint256(l.states)+7)/8);outputs=new bytes((uint256(nOut)+7)/8);uint256[] memory latchSources=new uint256[](l.latch);uint256[] memory latchOffsets=new uint256[](l.latch);
        uint256 pos;uint256 wire=2+uint256(nIn);uint256 stateOffset;uint256 latchIndex;
        while(pos<program.length){uint8 op=uint8(program[pos++]);
            if(op==0){wires[wire++]=!(wires[ROtapRuntime.u24(program,pos)]&&wires[ROtapRuntime.u24(program,pos+3)]);pos+=6;}
            else if(op==1){latchSources[latchIndex]=ROtapRuntime.u24(program,pos);latchOffsets[latchIndex++]=stateOffset;wires[wire++]=ROtapRuntime.bit(state,stateOffset++);pos+=3;}
            else{Reference memory r=referenceAt(program,pos,registry);bytes memory refInputs=new bytes((uint256(r.nIn)+7)/8);bytes memory refState=new bytes((uint256(r.states)+7)/8);
                for(uint256 i;i<r.nIn;i++)if(wires[ROtapRuntime.u24(program,pos+30+i*3)])ROtapRuntime.setBit(refInputs,i);
                for(uint256 i;i<r.states;i++)if(ROtapRuntime.bit(state,stateOffset+i))ROtapRuntime.setBit(refState,i);
                (bytes memory refNext,bytes memory refOutputs)=IROtapReferencedCircuit(r.target).step(r.id,refState,refInputs);
                require(refNext.length==refState.length&&refOutputs.length==(uint256(r.nOut)+7)/8,'REF_RESULT');
                for(uint256 i;i<r.states;i++)if(ROtapRuntime.bit(refNext,i))ROtapRuntime.setBit(next,stateOffset+i);
                for(uint256 i;i<r.nOut;i++)wires[wire+i]=ROtapRuntime.bit(refOutputs,i);
                stateOffset+=r.states;wire+=r.nOut;pos+=30+uint256(r.nIn)*3;
            }
        }
        for(uint256 i;i<l.latch;i++)if(wires[latchSources[i]])ROtapRuntime.setBit(next,latchOffsets[i]);
        for(uint256 i;i<nOut;i++)if(wires[wires.length-nOut+i])ROtapRuntime.setBit(outputs,i);
    }
}
