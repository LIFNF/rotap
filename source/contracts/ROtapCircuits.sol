// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRuntime.sol';
import './ROtapTransistors.sol';
import './ROtapReferenceRuntime.sol';

interface IROtapTransferHook {function beforeCircuitTransfer(uint256 id,address from,address to) external;}
interface IROtapAccountList {function isAccount(address account) external view returns(bool);function accountOf(address circuits,uint256 id) external view returns(address);}
interface IROtapFactoryDefaults {function protocolWallet() external view returns(address);function defaultTapeoutFee() external view returns(uint256);}

/// Persistent circuit programs. REF execution is separate from mining eligibility.
contract ROtapCircuits {
    string public name;string public symbol;
    address public TREASURY;address public initializer;
    address public factory;
    uint256 public TAPEOUT_FEE;
    ROtapTransistors public transistors;
    bool private initialized;
    address public mining;
    bool public miningConfigured;
    address public accountOpener;
    uint256 public nextId;
    uint256 public owedFees;
    uint256 private lock;
    struct Circuit {bytes program;uint32 nIn;uint32 nOut;ROtapRuntime.Metrics metrics;uint32 states;uint32 gateCount;bool references;}
    mapping(uint256=>Circuit) private data;
    mapping(uint256=>address) private owners;
    mapping(address=>uint256) private balances;
    mapping(uint256=>address) public getApproved;
    mapping(address=>mapping(address=>bool)) public isApprovedForAll;
    mapping(address=>uint256[]) private ownedIds;mapping(uint256=>uint256) private ownedIndex;
    event Transfer(address indexed from,address indexed to,uint256 indexed tokenId);
    event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner,address indexed operator,bool approved);
    event TapedOut(uint256 indexed circuitId,address indexed owner,uint32 nIn,uint32 nOut,uint32 nState,uint32 gateCount);
    event TapeoutFeeSet(uint256 fee);
    modifier nonReentrant(){require(lock==0,'REENTRANCY');lock=1;_;lock=0;}
    constructor(address treasury,uint256 mintPrice,uint256 protocolFee,uint256 tapeoutFee){
        initialized=true;
        if(treasury!=address(0)){TREASURY=treasury;initializer=msg.sender;factory=msg.sender;TAPEOUT_FEE=tapeoutFee;name='ROtap Circuit';symbol='ROTC';transistors=new ROtapTransistors(treasury,treasury,address(this),mintPrice,protocolFee);}
    }
    function initialize(string calldata name_,string calldata symbol_,address transistors_,address factory_) external {
        require(!initialized&&msg.sender==factory_&&factory_.code.length>0&&transistors_.code.length>0,'INITIALIZED');initialized=true;
        name=name_;symbol=symbol_;factory=factory_;initializer=factory_;transistors=ROtapTransistors(transistors_);TREASURY=IROtapFactoryDefaults(factory_).protocolWallet();TAPEOUT_FEE=IROtapFactoryDefaults(factory_).defaultTapeoutFee();
    }
    function configureMining(address hook) external {require(msg.sender==initializer&&!miningConfigured&&hook.code.length>0,'AUTH');mining=hook;miningConfigured=true;}
    function configureAccounts(address opener) external {require(msg.sender==initializer&&accountOpener==address(0)&&opener.code.length>0,'AUTH');accountOpener=opener;}
    function ownerOf(uint256 id) public view returns(address){address account=owners[id];require(account!=address(0),'TOKEN');return account;}
    function balanceOf(address account) external view returns(uint256){require(account!=address(0),'ZERO');return balances[account];}
    function tokensOfOwner(address account,uint256 offset,uint256 limit) external view returns(uint256[] memory result){require(limit<=200,'LIMIT');uint256 count=ownedIds[account].length;if(offset>=count)return new uint256[](0);uint256 end=offset+limit;if(end>count)end=count;result=new uint256[](end-offset);for(uint256 i=offset;i<end;i++)result[i-offset]=ownedIds[account][i];}
    function supportsInterface(bytes4 id) external pure returns(bool){return id==0x01ffc9a7||id==0x80ac58cd||id==0x5b5e139f;}
    function tokenURI(uint256 id) external view returns(string memory){ownerOf(id);Circuit storage c=data[id];return string.concat('data:application/json;base64,',ROtapMetadata.base64(bytes(string.concat('{"name":"',ROtapMetadata.escape(name),' #',ROtapMetadata.decimal(id),'","description":"On-chain circuit program","attributes":[{"trait_type":"Inputs","value":',ROtapMetadata.decimal(c.nIn),'},{"trait_type":"Outputs","value":',ROtapMetadata.decimal(c.nOut),'},{"trait_type":"State bits","value":',ROtapMetadata.decimal(c.states),'},{"trait_type":"Gates","value":',ROtapMetadata.decimal(c.gateCount),'}]}'))));}
    function transistorsContract() external view returns(address){return address(transistors);}
    function circuitInfo(uint256 id) external view returns(uint32 nIn,uint32 nOut,uint32 nState,uint32 gateCount){ownerOf(id);Circuit storage c=data[id];return(c.nIn,c.nOut,c.states,c.gateCount);}
    function netlist(uint256 id) external view returns(bytes memory){ownerOf(id);return data[id].program;}
    function circuitMetrics(uint256 id) external view returns(ROtapRuntime.Metrics memory){ownerOf(id);require(!data[id].references,'REF_INELIGIBLE');return data[id].metrics;}
    function hasReferences(uint256 id) external view returns(bool){ownerOf(id);return data[id].references;}
    function tapeout(bytes calldata program,uint32 nIn,uint32 nOut) external payable nonReentrant returns(uint256 id){
        require(msg.value==TAPEOUT_FEE,'PAYMENT');
        ROtapReferenceRuntime.Layout memory layout=ROtapReferenceRuntime.describe(program,nIn,nOut,factory);
        ROtapRuntime.Metrics memory m;
        if(!layout.hasRefs)m=ROtapRuntime.inspect(program,nIn,nOut);else{m.nand=layout.nand;m.latch=layout.latch;}
        require(layout.gates>0,'EMPTY');
        if(m.nand>0)transistors.burnFrom(msg.sender,0,m.nand);
        if(m.latch>0)transistors.burnFrom(msg.sender,1,m.latch);
        id=++nextId;data[id]=Circuit(program,nIn,nOut,m,layout.states,layout.gates,layout.hasRefs);owners[id]=msg.sender;balances[msg.sender]++;ownedIndex[id]=ownedIds[msg.sender].length;ownedIds[msg.sender].push(id);owedFees+=msg.value;
        emit Transfer(address(0),msg.sender,id);emit TapedOut(id,msg.sender,nIn,nOut,layout.states,layout.gates);
        accept(msg.sender,address(0),msg.sender,id,'');
    }
    function eval(uint256 id,bytes calldata inputs) external view returns(bytes memory outputs){
        ownerOf(id);Circuit storage c=data[id];require(c.states==0,'SEQUENTIAL');
        if(c.references)(,outputs)=ROtapReferenceRuntime.run(c.program,c.nIn,c.nOut,'',inputs,factory);else (,outputs)=ROtapRuntime.runValidated(c.program,c.nIn,c.nOut,'',inputs,c.metrics.nand,c.metrics.latch);
    }
    function step(uint256 id,bytes calldata state,bytes calldata inputs) external view returns(bytes memory newState,bytes memory outputs){
        ownerOf(id);Circuit storage c=data[id];if(c.references)return ROtapReferenceRuntime.run(c.program,c.nIn,c.nOut,state,inputs,factory);return ROtapRuntime.runValidated(c.program,c.nIn,c.nOut,state,inputs,c.metrics.nand,c.metrics.latch);
    }
    /// Execute immutable task programs using counts validated at tapeout, loading program storage only once.
    function runTask(uint256 id,uint32 cycles,bytes calldata input) external view returns(bytes memory result){
        ownerOf(id);Circuit storage c=data[id];require(!c.references&&cycles>0&&cycles<=256&&(c.states>0||cycles==1),'CYCLES');
        uint256 inputSize=(uint256(c.nIn)+7)/8;uint256 outputSize=(uint256(c.nOut)+7)/8;require(input.length==inputSize*cycles,'INPUT_LENGTH');
        bytes memory program=c.program;uint32 nIn=c.nIn;uint32 nOut=c.nOut;uint32 nand=c.metrics.nand;uint32 latch=c.metrics.latch;bytes memory state;result=new bytes(outputSize*cycles);
        for(uint256 cycle;cycle<cycles;cycle++){bytes memory vector=new bytes(inputSize);for(uint256 j;j<inputSize;j++)vector[j]=input[cycle*inputSize+j];bytes memory out;(state,out)=ROtapRuntime.runValidated(program,nIn,nOut,state,vector,nand,latch);for(uint256 j;j<outputSize;j++)result[cycle*outputSize+j]=out[j];}
    }
    function approve(address operator,uint256 id) external {address account=ownerOf(id);require(msg.sender==account||isApprovedForAll[account][msg.sender],'AUTH');require(operator!=account,'SELF');getApproved[id]=operator;emit Approval(account,operator,id);}
    function setApprovalForAll(address operator,bool approved) external {require(operator!=msg.sender,'SELF');isApprovedForAll[msg.sender][operator]=approved;emit ApprovalForAll(msg.sender,operator,approved);}
    function transferFrom(address from,address to,uint256 id) public nonReentrant {
        require(ownerOf(id)==from&&to!=address(0),'OWNER');require(msg.sender==from||getApproved[id]==msg.sender||isApprovedForAll[from][msg.sender],'AUTH');
        if(mining!=address(0))IROtapTransferHook(mining).beforeCircuitTransfer(id,from,to);
        delete getApproved[id];uint256 index=ownedIndex[id];uint256 last=ownedIds[from][ownedIds[from].length-1];ownedIds[from][index]=last;ownedIndex[last]=index;ownedIds[from].pop();ownedIndex[id]=ownedIds[to].length;ownedIds[to].push(id);balances[from]--;balances[to]++;owners[id]=to;emit Transfer(from,to,id);
    }
    function safeTransferFrom(address from,address to,uint256 id) external {safeTransferFrom(from,to,id,'');}
    function safeTransferFrom(address from,address to,uint256 id,bytes memory extra) public {transferFrom(from,to,id);accept(msg.sender,from,to,id,extra);}
    function accept(address operator,address from,address to,uint256 id,bytes memory extra) private {
        if(to.code.length>0){(bool ok,bytes memory result)=to.call(abi.encodeWithSignature('onERC721Received(address,address,uint256,bytes)',operator,from,id,extra));require(ok&&result.length>=32&&abi.decode(result,(bytes4))==0x150b7a02,'RECEIVER');}
    }
    function sweepFees() external nonReentrant {require(msg.sender==TREASURY,'AUTH');uint256 amount=owedFees;owedFees=0;(bool ok,)=payable(TREASURY).call{value:amount}('');require(ok,'TRANSFER');}
}
