import fs from 'node:fs';
import solc from 'solc';
import {Interface,AbiCoder,keccak256,toUtf8Bytes,toBeHex,zeroPadValue} from 'ethers';
const factory='0x82935793a854fa2f2e8a9d2b3f17bbfbf81d6c05',helper='0x000000000000000000000000000000000000fa03';
const source=`pragma solidity ^0.8.24;
interface IF {function deployFee() external view returns(uint256);function protocolWallet() external view returns(address);function createCPU(string calldata,string calldata,string calldata,uint256,uint256) external payable returns(address,address);function seal() external;}
contract Probe {
function onERC1155Received(address,address,uint256,uint256,bytes calldata) external pure returns(bytes4){return 0xf23a6e61;}function onERC721Received(address,address,uint256,bytes calldata) external pure returns(bytes4){return 0x150b7a02;}
function firstTapeout(address f) external returns(uint256 id,uint256 nextId,uint256 beforeId){(address t,address c)=IF(f).createCPU{value:IF(f).deployFee()}("Test","T","",10,0);(,bytes memory beforeData)=c.staticcall(abi.encodeWithSignature("nextId()"));beforeId=abi.decode(beforeData,(uint256));(,bytes memory feeData)=t.staticcall(abi.encodeWithSignature("protocolFee()"));(bool minted,)=t.call{value:abi.decode(feeData,(uint256))}(abi.encodeWithSignature("mint(uint256,uint256)",0,1));require(minted,"mint");(,feeData)=c.staticcall(abi.encodeWithSignature("TAPEOUT_FEE()"));(bool taped,bytes memory data)=c.call{value:abi.decode(feeData,(uint256))}(abi.encodeWithSignature("tapeout(bytes,uint32,uint32)",hex"00000002000002",1,1));require(taped,"tape");id=abi.decode(data,(uint256));(,data)=c.staticcall(abi.encodeWithSignature("nextId()"));nextId=abi.decode(data,(uint256));}

function create(address f,string calldata name,string calldata symbol,string calldata story,uint256 supply,uint256 price,int256 delta) external returns(bool ok,bytes memory result,bytes[] memory info){uint256 fee=IF(f).deployFee();(ok,result)=f.call{value:uint256(int256(fee)+delta)}(abi.encodeCall(IF.createCPU,(name,symbol,story,supply,price)));if(!ok)return(ok,result,new bytes[](0));(address t,address c)=abi.decode(result,(address,address));string[14] memory getters=["creator()","protocolWallet()","mintPrice()","protocolFee()","supplyCap()","circuits()","cpuName()","cpuSymbol()","story()","factory()","nextId()","TAPEOUT_FEE()","TREASURY()","transistors()"];info=new bytes[](19);for(uint256 i;i<14;i++){(bool success,bytes memory value)=(i<9?t:c).staticcall(abi.encodeWithSignature(getters[i]));info[i]=abi.encode(success,value);}for(uint256 i;i<5;i++){bytes memory query=i==0?abi.encodeWithSignature("isCPU(address)",c):i==1?abi.encodeWithSignature("owed(address)",IF(f).protocolWallet()):i==2?abi.encodeWithSignature("cpuCount()"):i==3?abi.encodeWithSignature("isCPU(address)",t):abi.encodeWithSignature("owed(address)",address(this));(bool success,bytes memory value)=f.staticcall(query);info[14+i]=abi.encode(success,value);}}
function govern(address f,bytes[] calldata actions,bool sealedFirst) external returns(bool[] memory ok,bytes[] memory results){if(sealedFirst)IF(f).seal();ok=new bool[](actions.length);results=new bytes[](actions.length);for(uint256 i;i<actions.length;i++)(ok[i],results[i])=f.call(actions[i]);}
}`;
const o=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'Probe.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},viaIR:true,evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.deployedBytecode.object']}}}})));
const errors=(o.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(JSON.stringify(errors));const a=o.contracts['Probe.sol'].Probe,iface=new Interface(a.abi),fi=new Interface(JSON.parse(fs.readFileSync('reference-v2/abi/circuitFactory.json'))),coder=AbiCoder.defaultAbiCoder();
fs.writeFileSync('reference-v2/factory-probe-helper.json',JSON.stringify({source,abi:a.abi,runtime:'0x'+a.evm.deployedBytecode.object}));
const cases=[
 {name:'standard',args:['Processor','CPU','Story',1000,123,0]},
 {name:'overpay',args:['Processor','CPU','Story',1000,123,1]},
 {name:'underpay',args:['Processor','CPU','Story',1000,123,-1]},
 {name:'zero-supply',args:['Processor','CPU','Story',0,123,0]},
 {name:'zero-price',args:['Processor','CPU','Story',1000,0,0]},
 {name:'empty-name-symbol-story',args:['','','',1000,123,0]},
];
cases.push({name:'first-tapeout',tapeout:true});for(const c of cases)c.owner=true;cases.push({name:'outsider-create',args:['Processor','CPU','Story',1000,123,0]});
const actions=[['setDeployFee',[999]],['setProtocolFee',[888]],['setProtocolWallet',[helper]],['registerExternalCPU',['0x1f09daefa827f02cbb40967cc91b259763760761','0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6']],['registerExternalCPU',['0x1f09daefa827f02cbb40967cc91b259763760761','0x87bfca3494aa228ff589ab9b642143a5e8c8f9a6']],['upgradeTransistors',['0x265bf10fab9ddec0ee0a649c6b9db845f1b9a06b']],['upgradeCircuits',['0x977f217887e085d298cb3819cdad5a0ee35f29b2']],['seal',[]],['transferOwnership',[helper]],['renounceOwnership',[]],['owner',[]],['isSealed',[]]];
for(const sealedFirst of [false,true])cases.push({name:sealedFirst?'owner-after-seal':'owner-before-seal',owner:true,actions:actions.map(([fn,args])=>({fn,data:fi.encodeFunctionData(fn,args)})),sealedFirst});
cases.push({name:'outsider-governance',actions:actions.map(([fn,args])=>({fn,data:fi.encodeFunctionData(fn,args)})),sealedFirst:false});
const ownerSlot=toBeHex(BigInt(keccak256(coder.encode(['uint256'],[BigInt(keccak256(toUtf8Bytes('openzeppelin.storage.Ownable')))-1n])))&~255n,32);
const requests=cases.map((c,i)=>({id:i+1,method:'eth_call',params:[{to:helper,data:iface.encodeFunctionData(c.tapeout?'firstTapeout':c.actions?'govern':'create',c.tapeout?[factory]:c.actions?[factory,c.actions.map(x=>x.data),c.sealedFirst]:[factory,...c.args]),gas:'0x1c9c380'},'0x45ff3fb',{[helper]:{code:'0x'+a.evm.deployedBytecode.object,balance:'0x8ac7230489e80000'},...(c.owner?{[factory]:{stateDiff:{[ownerSlot]:zeroPadValue(helper,32)}}}:{})}]}));
fs.writeFileSync('reference-v2/factory-probe-cases.json',JSON.stringify(cases,null,2));fs.writeFileSync('reference-v2/factory-probe-requests.json',JSON.stringify(requests));
console.log('Prepared '+cases.length+' read-only factory probes.');
