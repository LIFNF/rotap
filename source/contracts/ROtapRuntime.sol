// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Independent NAND/LATCH runtime, based on the published wire format.
/// REF execution is deliberately rejected until its full state semantics are verified.
library ROtapRuntime {
    struct Metrics {uint32 nand;uint32 latch;uint32 depth;uint256 burn;uint256 area;uint256 cost;}
    function u24(bytes memory data,uint256 offset) internal pure returns(uint256){
        require(offset+3<=data.length,"TRUNCATED");
        return (uint256(uint8(data[offset]))<<16)|(uint256(uint8(data[offset+1]))<<8)|uint8(data[offset+2]);
    }
    function counts(bytes memory data) internal pure returns(uint32 nand,uint32 latch){
        uint256 pos;
        while(pos<data.length){uint8 op=uint8(data[pos]);uint256 size;
            if(op==0){nand++;size=7;}else if(op==1){latch++;size=4;}else revert("UNSUPPORTED_OPCODE");
            require(pos+size<=data.length,"TRUNCATED");pos+=size;
        }
    }
    function inspect(bytes memory data,uint32 nIn,uint32 nOut) internal pure returns(Metrics memory m){
        (m.nand,m.latch)=counts(data);uint256 length=2+uint256(nIn)+m.nand+m.latch;
        require(nOut>0&&nOut<=length,"OUTPUTS");
        uint256[] memory levels=new uint256[](length);
        uint256[] memory nextState=new uint256[](m.latch);
        uint256 wire=2+uint256(nIn);uint256 pos;uint256 stateId;
        while(pos<data.length){uint8 op=uint8(data[pos++]);uint256 a=u24(data,pos);
            if(op==0){uint256 b=u24(data,pos+3);require(a<wire&&b<wire,"FORWARD_NAND");levels[wire]=1+(levels[a]>levels[b]?levels[a]:levels[b]);pos+=6;}
            else {require(a<length,"STATE_WIRE");nextState[stateId++]=a;pos+=3;}
            wire++;
        }
        uint256 depth;
        for(uint256 i=length-nOut;i<length;i++)if(levels[i]>depth)depth=levels[i];
        for(uint256 i;i<nextState.length;i++)if(levels[nextState[i]]>depth)depth=levels[nextState[i]];
        m.depth=uint32(depth);m.burn=uint256(m.nand)+m.latch;
        m.area=uint256(m.nand)+uint256(m.latch)*7;
        m.cost=m.area*(depth==0?1:depth)**3;
    }
    function bit(bytes memory data,uint256 index) internal pure returns(bool){
        return index/8<data.length&&(uint8(data[index/8])&(uint8(1)<<uint8(index%8)))!=0;
    }
    function setBit(bytes memory data,uint256 index) internal pure {data[index/8]|=bytes1(uint8(1)<<uint8(index%8));}
    function liveGateCount(bytes memory data,uint32 nIn,uint32 nOut) internal pure returns(uint32 count){
        Metrics memory measured=inspect(data,nIn,nOut);uint256 gates=uint256(measured.nand)+measured.latch;uint256 base=2+uint256(nIn);
        uint256[] memory a=new uint256[](gates);uint256[] memory b=new uint256[](gates);bool[] memory nand=new bool[](gates);
        uint256 pos;uint256 gate;
        while(pos<data.length){uint8 op=uint8(data[pos++]);a[gate]=u24(data,pos);if(op==0){nand[gate]=true;b[gate]=u24(data,pos+3);pos+=6;}else pos+=3;gate++;}
        bool[] memory queued=new bool[](gates);uint256[] memory stack=new uint256[](gates);uint256 size;
        for(uint256 wire=base+gates-nOut;wire<base+gates;wire++)if(wire>=base){uint256 index=wire-base;queued[index]=true;stack[size++]=index;}
        while(size>0){uint256 index=stack[--size];count++;uint256 first=a[index];if(first>=base&&!queued[first-base]){queued[first-base]=true;stack[size++]=first-base;}
            if(nand[index]){uint256 second=b[index];if(second>=base&&!queued[second-base]){queued[second-base]=true;stack[size++]=second-base;}}
        }
    }
    function run(bytes memory data,uint32 nIn,uint32 nOut,bytes memory state,bytes memory inputs) internal pure returns(bytes memory newState,bytes memory outputs){
        Metrics memory m=inspect(data,nIn,nOut);return runValidated(data,nIn,nOut,state,inputs,m.nand,m.latch);
    }
    /// Only immutable programs already validated by tapeout may enter this execution path.
    function runValidated(bytes memory data,uint32 nIn,uint32 nOut,bytes memory state,bytes memory inputs,uint32 nand,uint32 latch) internal pure returns(bytes memory newState,bytes memory outputs){
        require(inputs.length==(uint256(nIn)+7)/8,"INPUT_LENGTH");
        require(state.length==0||state.length==(uint256(latch)+7)/8,"STATE_LENGTH");
        bool[] memory wires=new bool[](2+uint256(nIn)+nand+latch);wires[1]=true;
        for(uint256 i;i<nIn;i++)wires[2+i]=bit(inputs,i);
        uint256[] memory updateFrom=new uint256[](latch);
        uint256 pos;uint256 at=2+uint256(nIn);uint256 stateId;
        while(pos<data.length){uint8 op=uint8(data[pos++]);uint256 a=u24(data,pos);
            if(op==0){wires[at]=!(wires[a]&&wires[u24(data,pos+3)]);pos+=6;}
            else {updateFrom[stateId]=a;wires[at]=bit(state,stateId++);pos+=3;}at++;
        }
        newState=new bytes((uint256(latch)+7)/8);outputs=new bytes((uint256(nOut)+7)/8);
        for(uint256 i;i<latch;i++)if(wires[updateFrom[i]])setBit(newState,i);
        for(uint256 i;i<nOut;i++)if(wires[wires.length-nOut+i])setBit(outputs,i);
    }
}

contract ROtapRuntimeHarness {
    function metrics(bytes calldata data,uint32 nIn,uint32 nOut) external pure returns(ROtapRuntime.Metrics memory){return ROtapRuntime.inspect(data,nIn,nOut);}
    function step(bytes calldata data,uint32 nIn,uint32 nOut,bytes calldata state,bytes calldata inputs) external pure returns(bytes memory,bytes memory){return ROtapRuntime.run(data,nIn,nOut,state,inputs);}
    function liveGates(bytes calldata data,uint32 nIn,uint32 nOut) external pure returns(uint32){return ROtapRuntime.liveGateCount(data,nIn,nOut);}
}
