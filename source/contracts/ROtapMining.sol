// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRuntime.sol';
import './ROtapTaskRegistry.sol';
import './ROtapContinuousLedger.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';

interface IROtapMinerCircuit is IROtapExecutable {function ownerOf(uint256) external view returns(address);function netlist(uint256) external view returns(bytes memory);function nextId() external view returns(uint256);}
interface IROtapSamplingPolicy {
    function sampleIndexes(address circuits,uint256 circuitId,uint32 taskId,uint256 anchorBlock) external view returns(uint32[] memory);
    function checkBudget(uint32 gates,uint32 cycles,uint256 samples) external view returns(bool);
    function sampleCountFor(uint32 gates,uint32 cycles) external view returns(uint32);
    function indexes(bytes32,address,uint256,uint32,uint32) external view returns(uint32[] memory);
}
interface IROtapFactor {function factorBps(address holder) external view returns(uint256);}
interface IROtapSamplingAdmin {function raiseMaxRunGas(uint256) external;function seal() external;function maxRunGas() external view returns(uint256);}

/// Mining lifecycle candidate. Final sampling policy and original task data are not supplied here.
contract ROtapMining is OwnableUpgradeable,PausableUpgradeable,UUPSUpgradeable {
    ROtapTaskRegistry public registry;
    ROtapContinuousLedger public ledger;
    IROtapSamplingPolicy public sampling;
    ROtapLedgerFactory public immutable ledgerFactory;
    uint256 public constant MAX_ANCHOR_AGE=200;
    uint256 public constant STOP_COOLDOWN=1200;
    uint256 public constant OWNER_HEAD_START=1800;
    bool public isSealed;uint32 public eligibleEpoch;
    address public boost;
    mapping(address=>uint256) public processorMultiplier;
    mapping(bytes32=>uint256) public armedAt;
    mapping(address=>mapping(bytes32=>uint256)) public designCommits;
    mapping(address=>mapping(bytes32=>uint256)) public designFirstUnusedId;
    struct Miner {address circuits;uint256 circuitId;uint32 taskId;bool active;bool revoked;uint256 restartAt;uint256 cost;uint256 burn;uint256 designAt;address holder;uint256 mult;}
    mapping(bytes32=>Miner) public miners;
    mapping(uint32=>mapping(address=>bytes32)) public bestSlot;
    mapping(uint32=>mapping(address=>uint256)) public bestCost;
    mapping(uint32=>mapping(address=>uint256)) public bestCommitBlock;
    mapping(uint32=>mapping(address=>uint256)) public bestTombstoneBlock;
    mapping(uint32=>mapping(address=>bytes[])) private counterexamples;
    mapping(address=>bytes32[]) private holderKeys;
    mapping(bytes32=>uint256) private holderIndex;
    bytes32[] private allKeys;
    event Started(bytes32 indexed key,address indexed holder,uint32 taskId);
    event Stopped(bytes32 indexed key);
    event Revoked(bytes32 indexed key,uint32 vectorIndex);
    event Demoted(bytes32 indexed key,bytes input);
    event Sealed();
    modifier unsealed(){require(!isSealed,'SEALED');_;}
    constructor(address registry_,address policy,uint256 genesis,uint256 period,uint256 rate,address ledgerFactory_){
        require(ledgerFactory_.code.length>0,'LEDGER_FACTORY');ledgerFactory=ROtapLedgerFactory(ledgerFactory_);_disableInitializers();if(registry_!=address(0)){_transferOwnership(msg.sender);configure(registry_,policy,genesis,period,rate);}
    }
    function initialize(address owner_,address registry_,address policy,uint256 genesis,uint256 period,uint256 rate) external initializer {__Ownable_init(owner_);__Pausable_init();__UUPSUpgradeable_init();configure(registry_,policy,genesis,period,rate);}
    function configure(address registry_,address policy,uint256 genesis,uint256 period,uint256 rate) private {
        require(registry_.code.length>0&&policy.code.length>0,'CONFIG');registry=ROtapTaskRegistry(registry_);sampling=IROtapSamplingPolicy(policy);
        ledger=ROtapContinuousLedger(ledgerFactory.create(address(this),genesis,period,rate));
    }
    function setProcessor(address circuits,uint256 multiplier) external onlyOwner unsealed {require(multiplier<=100,'MULTIPLIER');processorMultiplier[circuits]=multiplier;}
    function setBoost(address boost_) external onlyOwner unsealed {boost=boost_;}
    function pause() external onlyOwner unsealed {_pause();}
    function unpause() external onlyOwner unsealed {_unpause();}
    function freezeTasks() external onlyOwner unsealed {registry.freezeTasks();}
    function taskCount() external view returns(uint32){return registry.taskCount();}
    function tasksFrozen() external view returns(bool){return registry.tasksFrozen();}
    function getTask(uint32 taskId) external view returns(ROtapTaskRegistry.Task memory){return registry.getTask(taskId);}
    function startTime() external view returns(uint256){return ledger.startTime();}
    function currentRate() external view returns(uint256){return ledger.currentRate();}
    function token() external view returns(address){return address(ledger.token());}
    function totalMined() external view returns(uint256){return ledger.token().totalSupply();}
    function totalForgone() external view returns(uint256){return ledger.totalForgone();}
    function totalVerifWeight() external view returns(uint256){return ledger.totalVerifWeight();}
    function totalUnverWeight() external view returns(uint256){return ledger.totalUnverWeight();}
    function accVerif() external view returns(uint256){return ledger.accVerif();}
    function accUnver() external view returns(uint256){return ledger.accUnver();}
    function lastUpdate() external view returns(uint256){return ledger.lastUpdate();}
    function pending(bytes32 key) external view returns(uint256){Miner storage m=miners[key];if(!m.active||m.revoked)return 0;uint256 factor=boost==address(0)?10000:IROtapFactor(boost).factorBps(m.holder);if(m.taskId==0)return ledger.pendingAtWeights(key,0,m.burn*m.mult*100);uint256 bonus=bestSlot[m.taskId][m.circuits]==key?registry.bonusOf(m.taskId,m.cost):0;return ledger.pendingAtWeights(key,(m.burn*factor+bonus*10000)*m.mult/100,0);}
    function poke() external {ledger.poke();}
    function addTask(string calldata name,uint8 kind,uint32 cycles,uint32 nIn,uint32 nOut,uint32 vectorCount,bytes32 root,address referenceCircuits,uint256 referenceId,uint256 anchor,bytes[] calldata inputs,bytes[] calldata expected,bytes32[][] calldata proofs) external onlyOwner returns(uint32){
        require(kind<=1&&anchor>0&&block.number>anchor&&block.number-anchor<=MAX_ANCHOR_AGE,'CONFIG');(uint32 actualIn,uint32 actualOut,uint32 states,)=IROtapMinerCircuit(referenceCircuits).circuitInfo(referenceId);require(actualIn==nIn&&actualOut==nOut&&(states>0)==(kind==1),'SHAPE');bytes memory program=IROtapMinerCircuit(referenceCircuits).netlist(referenceId);uint32 count=sampling.sampleCountFor(registry.liveGateCount(program,nIn,nOut),cycles);require(inputs.length==count,'SAMPLES');uint32[] memory indexes_=sampling.indexes(blockhash(anchor),referenceCircuits,referenceId,vectorCount,count);return registry.publish(name,referenceCircuits,referenceId,cycles,vectorCount,root,indexes_,inputs,expected,proofs);
    }
    function updateTaskRef(uint32 taskId,address circuits,uint256 id) external onlyOwner unsealed {registry.updateTaskRef(taskId,circuits,id);}
    function invalidateEligibilityCache() external onlyOwner unsealed {eligibleEpoch++;}
    function maxRunGas() external view returns(uint256){return IROtapSamplingAdmin(address(sampling)).maxRunGas();}
    function raiseMaxRunGas(uint256 limit) external onlyOwner unsealed {IROtapSamplingAdmin(address(sampling)).raiseMaxRunGas(limit);}
    function seal() external onlyOwner unsealed whenNotPaused {registry.freezeTasks();IROtapSamplingAdmin(address(sampling)).seal();isSealed=true;emit Sealed();}
    function _authorizeUpgrade(address) internal override onlyOwner unsealed {}
    function minerCount() external view returns(uint256){return allKeys.length;}
    function minerAt(uint256 index) external view returns(bytes32){return allKeys[index];}
    function holderMinerCount(address holder) external view returns(uint256){return holderKeys[holder].length;}
    function holderMinerAt(address holder,uint256 index) external view returns(bytes32){return holderKeys[holder][index];}
    function getMiner(bytes32 key) external view returns(Miner memory){return miners[key];}
    function ceCount(uint32 taskId,address circuits) external view returns(uint256){return counterexamples[taskId][circuits].length;}
    function counterexampleAt(uint32 taskId,address circuits,uint256 index) external view returns(bytes memory){return counterexamples[taskId][circuits][index];}
    function minerKey(address circuits,uint256 circuitId) public pure returns(bytes32){return keccak256(abi.encodePacked(circuits,circuitId));}
    function designCommitment(address designer,address circuits,bytes32 netlistHash,bytes32 salt) public pure returns(bytes32){return keccak256(abi.encode(designer,circuits,netlistHash,salt));}
    function commitDesign(address circuits,bytes32 commitment) external {require(processorMultiplier[circuits]>0&&commitment!=bytes32(0),'PROCESSOR');require(designCommits[circuits][commitment]==0,'DUPLICATE');designCommits[circuits][commitment]=block.number;designFirstUnusedId[circuits][commitment]=IROtapMinerCircuit(circuits).nextId()+1;}
    function arm(address circuits,uint256 id) external {require(IROtapMinerCircuit(circuits).ownerOf(id)==msg.sender&&processorMultiplier[circuits]>0,'OWNER');armedAt[minerKey(circuits,id)]=block.number;}
    function start(address circuits,uint256 id,uint32 taskId,uint256 anchor,bytes[] calldata inputs,bytes[] calldata expected,bytes32[][] calldata proofs,bytes32 salt) external whenNotPaused returns(bytes32 key){
        require(block.timestamp>=ledger.startTime()+OWNER_HEAD_START||msg.sender==owner(),'HEAD_START');
        require(processorMultiplier[circuits]>0&&IROtapMinerCircuit(circuits).ownerOf(id)==msg.sender,'OWNER');key=minerKey(circuits,id);Miner storage m=miners[key];
        require(!m.active&&!m.revoked&&block.number>=m.restartAt,'STATE');
        (uint32 nIn,uint32 nOut,,)=IROtapMinerCircuit(circuits).circuitInfo(id);
        ROtapRuntime.Metrics memory metrics=registry.inspectNetlist(IROtapMinerCircuit(circuits).netlist(id),nIn,nOut);require(metrics.burn>0,'BURN');
        if(taskId>0){
            require(armedAt[key]==anchor&&anchor>0&&block.number>anchor&&block.number-anchor<=MAX_ANCHOR_AGE&&blockhash(anchor)!=bytes32(0),'ANCHOR');
            ROtapTaskRegistry.Task memory task=registry.getTask(taskId);require(task.active,'CLOSED');uint32[] memory indexes=sampling.sampleIndexes(circuits,id,taskId,anchor);
            require(indexes.length>=3&&indexes.length<=task.vectorCount&&indexes.length==inputs.length&&inputs.length==expected.length&&inputs.length==proofs.length,'SAMPLES');
            require(sampling.checkBudget(metrics.nand+metrics.latch,task.cycles,indexes.length),'GAS_BUDGET');
            for(uint256 i;i<indexes.length;i++){
                require(registry.verifyOfficial(taskId,circuits,id,indexes[i],inputs[i],expected[i],proofs[i]),'VECTOR');
            }
        }
        if(m.circuits==address(0))allKeys.push(key);m.circuits=circuits;m.circuitId=id;m.taskId=taskId;m.active=true;m.cost=metrics.cost;m.burn=metrics.burn;m.holder=msg.sender;m.mult=processorMultiplier[circuits];
        bytes32 commitment=designCommitment(msg.sender,circuits,keccak256(IROtapMinerCircuit(circuits).netlist(id)),salt);uint256 committed=designCommits[circuits][commitment];
        if(committed>0&&id>=designFirstUnusedId[circuits][commitment]&&(m.designAt==0||committed<m.designAt))m.designAt=committed;
        attach(key,msg.sender);
        considerOriginal(key,false);
        sync(key,msg.sender);emit Started(key,msg.sender,taskId);
    }
    function sync(bytes32 key,address holder) private {
        Miner storage m=miners[key];uint256 verified;uint256 unverified;
        if(m.active&&!m.revoked){uint256 factor=boost==address(0)?10000:IROtapFactor(boost).factorBps(holder);uint256 multiplier=m.mult;
            if(m.taskId==0)unverified=m.burn*multiplier*100;
            else{uint256 bonus=bestSlot[m.taskId][m.circuits]==key?registry.bonusOf(m.taskId,m.cost):0;verified=(m.burn*factor+bonus*10000)*multiplier/100;}
        }
        ledger.setPosition(key,holder,verified,unverified);ledger.claimFor(holder,new bytes32[](0));
    }
    function considerOriginal(bytes32 key,bool mustImprove) private {
        Miner storage m=miners[key];bool qualified=m.active&&!m.revoked&&m.taskId>0&&m.designAt>0&&m.designAt<block.number&&passesCounterexamples(m.taskId,m.circuits,m.circuitId);bytes32 old=bestSlot[m.taskId][m.circuits];uint256 cost=bestCost[m.taskId][m.circuits];uint256 committed=bestCommitBlock[m.taskId][m.circuits];
        bool better=qualified&&old!=key&&(cost==0||m.cost<cost||(m.cost==cost&&old!=bytes32(0)&&m.designAt<committed));if(mustImprove)require(better,'WORSE');if(!better)return;
        bestSlot[m.taskId][m.circuits]=key;bestCost[m.taskId][m.circuits]=m.cost;bestCommitBlock[m.taskId][m.circuits]=m.designAt;if(old!=bytes32(0))sync(old,miners[old].holder);
    }
    function releaseOriginal(bytes32 key) private {Miner storage m=miners[key];if(bestSlot[m.taskId][m.circuits]==key)delete bestSlot[m.taskId][m.circuits];}
    function reclaim(bytes32 key) external whenNotPaused {considerOriginal(key,true);sync(key,miners[key].holder);}
    function stop(bytes32 key) external whenNotPaused {
        Miner storage m=miners[key];require(m.active&&IROtapMinerCircuit(m.circuits).ownerOf(m.circuitId)==msg.sender,'OWNER');
        m.active=false;m.restartAt=block.number+STOP_COOLDOWN;if(bestSlot[m.taskId][m.circuits]==key)bestTombstoneBlock[m.taskId][m.circuits]=block.number;sync(key,msg.sender);detach(key);emit Stopped(key);
    }
    function challenge(bytes32 key,uint32 index,bytes calldata input,bytes calldata expected,bytes32[] calldata proof) external whenNotPaused {
        Miner storage m=miners[key];require(m.active&&m.taskId>0,'MINER');require(!registry.verifyOfficial(m.taskId,m.circuits,m.circuitId,index,input,expected,proof),'PASSES');
        m.active=false;m.revoked=true;releaseOriginal(key);sync(key,m.holder);detach(key);emit Revoked(key,index);
    }
    function passesCounterexamples(uint32 taskId,address circuits,uint256 id) public view returns(bool){bytes[] storage examples=counterexamples[taskId][circuits];for(uint256 i;i<examples.length;i++)if(!registry.matchesReference(taskId,circuits,id,examples[i]))return false;return true;}
    function registerCounterexample(uint32 taskId,address circuits,bytes calldata input) external whenNotPaused {
        bytes32 key=bestSlot[taskId][circuits];require(key!=bytes32(0),'SLOT');Miner storage m=miners[key];require(!registry.matchesReference(taskId,circuits,m.circuitId,input),'PASSES');
        bytes[] storage examples=counterexamples[taskId][circuits];for(uint256 i;i<examples.length;i++)require(keccak256(examples[i])!=keccak256(input),'DUPLICATE');examples.push(input);
    }
    function kick(uint32 taskId,address circuits) external whenNotPaused {bytes32 key=bestSlot[taskId][circuits];require(key!=bytes32(0),'SLOT');Miner storage m=miners[key];require(!passesCounterexamples(taskId,circuits,m.circuitId),'PASSES');releaseOriginal(key);sync(key,m.holder);emit Demoted(key,'');}
    function claim(bytes32 key) external whenNotPaused returns(uint256){bytes32[] memory keys=new bytes32[](1);keys[0]=key;return claimKeys(keys);}
    function claimMany(bytes32[] calldata keys) external whenNotPaused returns(uint256){return claimKeys(keys);}
    function claimKeys(bytes32[] memory keys) private returns(uint256 amount){uint256 beforeSupply=ledger.token().totalSupply();for(uint256 i;i<keys.length;i++){Miner storage m=miners[keys[i]];require(m.circuits!=address(0),'MINER');sync(keys[i],m.holder);}return ledger.token().totalSupply()-beforeSupply;}
    function beforeCircuitTransfer(uint256 id,address from,address to) external {
        require(processorMultiplier[msg.sender]>0,'PROCESSOR');bytes32 key=minerKey(msg.sender,id);Miner storage m=miners[key];if(!m.active)return;require(m.holder==from,'HOLDER');
        detach(key);m.holder=to;attach(key,to);ledger.reassign(key,to);
    }
    function beforeFactorChange(address holder) external {require(msg.sender==boost,'BOOST');bytes32[] storage keys=holderKeys[holder];if(keys.length>0)require(!paused(),'PAUSED');ledger.claimFor(holder,keys);}
    function afterFactorChange(address holder) external {require(msg.sender==boost,'BOOST');bytes32[] storage keys=holderKeys[holder];for(uint256 i;i<keys.length;i++)sync(keys[i],holder);}
    function beforeFactorChangeForKeys(address,bytes32[] calldata keys) external {require(msg.sender==boost,'BOOST');if(keys.length>0)require(!paused(),'PAUSED');claimKeys(keys);}
    function afterFactorChangeForKeys(address,bytes32[] calldata keys) external {require(msg.sender==boost,'BOOST');if(keys.length>0)require(!paused(),'PAUSED');claimKeys(keys);}
    function attach(bytes32 key,address holder) private {holderIndex[key]=holderKeys[holder].length;holderKeys[holder].push(key);}
    function detach(bytes32 key) private {address holder=miners[key].holder;bytes32[] storage keys=holderKeys[holder];uint256 index=holderIndex[key];bytes32 last=keys[keys.length-1];keys[index]=last;holderIndex[last]=index;keys.pop();delete holderIndex[key];}
}
