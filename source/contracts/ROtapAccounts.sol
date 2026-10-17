// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts/proxy/beacon/IBeacon.sol';
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
interface IROtapNFTOwner {function ownerOf(uint256) external view returns(address);}
interface IROtapAccountFactory {function isCPU(address) external view returns(bool);}
interface IROtapAccountMaterials {function circuits() external view returns(address);}
interface IROtapAccountMarket {function listingFor(address,uint256) external view returns(uint256,address,uint96,bool);}
interface IROtapERC6551Registry {function createAccount(address,bytes32,uint256,address,uint256) external returns(address);function account(address,bytes32,uint256,address,uint256) external view returns(address);}

/// ERC-6551 registry creation code and appended immutable data follow the standard.
contract ROtapAccountRegistry {
    event ERC6551AccountCreated(address account,address indexed implementation,bytes32 salt,uint256 chainId,address indexed tokenContract,uint256 indexed tokenId);
    function creationCode(address implementation,bytes32 salt,uint256 chainId,address tokenContract,uint256 tokenId) public pure returns(bytes memory){return abi.encodePacked(hex"3d60ad80600a3d3981f3",hex"363d3d373d3d3d363d73",implementation,hex"5af43d82803e903d91602b57fd5bf3",abi.encode(salt,chainId,tokenContract,tokenId));}
    function account(address implementation,bytes32 salt,uint256 chainId,address tokenContract,uint256 tokenId) public view returns(address){return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff),address(this),salt,keccak256(creationCode(implementation,salt,chainId,tokenContract,tokenId)))))));}
    function createAccount(address implementation,bytes32 salt,uint256 chainId,address tokenContract,uint256 tokenId) external returns(address result){result=account(implementation,salt,chainId,tokenContract,tokenId);if(result.code.length>0)return result;bytes memory code=creationCode(implementation,salt,chainId,tokenContract,tokenId);address deployed;assembly ("memory-safe"){deployed:=create2(0,add(code,32),mload(code),salt)}require(deployed==result&&deployed!=address(0),'ACCOUNT_CREATION');emit ERC6551AccountCreated(result,implementation,salt,chainId,tokenContract,tokenId);}
}

contract ROtapAccountPayments {
    address public immutable administrator;address public opener;mapping(address=>bool) public paid;
    event Paid(address indexed account,address indexed payer);
    constructor(address administrator_){require(administrator_!=address(0),'ZERO');administrator=administrator_;}
    function setOpener(address opener_) external {require(msg.sender==administrator&&opener==address(0)&&opener_.code.length>0,'AUTH');opener=opener_;}
    function markPaid(address account,address payer) external {require(msg.sender==opener&&!paid[account],'AUTH');paid[account]=true;emit Paid(account,payer);}
}

/// All token-bound accounts delegate through this router to a shared, upgradeable beacon.
contract ROtapAccountRouter {
    IBeacon public immutable beacon;
    constructor(address beacon_){require(beacon_.code.length>0,'BEACON');beacon=IBeacon(beacon_);}
    fallback() external payable {address implementation=beacon.implementation();assembly ("memory-safe"){let ptr:=mload(0x40)calldatacopy(ptr,0,calldatasize())let ok:=delegatecall(gas(),implementation,ptr,calldatasize(),0,0)returndatacopy(ptr,0,returndatasize())switch ok case 0 {revert(ptr,returndatasize())} default {return(ptr,returndatasize())}}}
}

contract ROtapAccountBeacon is UpgradeableBeacon {constructor(address implementation_,address owner_) UpgradeableBeacon(implementation_,owner_) {}}

contract ROtapCircuitAccount {
    address public immutable factory;address public immutable market;ROtapAccountPayments public immutable payments;
    address public immutable treasury;uint256 public immutable EXEC_FEE;uint256 public immutable BATCH_FEE;
    uint256 public state;uint256 private entered;
    modifier nonReentrant(){require(entered==0,'REENTRANCY');entered=1;_;entered=0;}
    constructor(address market_,address payments_,address treasury_,address factory_,uint256 execFee,uint256 batchFee){require(market_.code.length>0&&payments_.code.length>0&&factory_.code.length>0&&treasury_!=address(0),'CONFIG');market=market_;payments=ROtapAccountPayments(payments_);treasury=treasury_;factory=factory_;EXEC_FEE=execFee;BATCH_FEE=batchFee;}
    receive() external payable {}
    function token() public view returns(uint256 chainId,address tokenContract,uint256 tokenId){bytes memory footer=new bytes(96);assembly ("memory-safe"){extcodecopy(address(),add(footer,32),77,96)}return abi.decode(footer,(uint256,address,uint256));}
    function owner() public view returns(address){(uint256 chainId,address circuit,uint256 id)=token();if(chainId!=block.chainid||circuit.code.length==0)return address(0);try IROtapNFTOwner(circuit).ownerOf(id) returns(address holder){return holder;}catch{return address(0);}}
    function isValidSigner(address signer,bytes calldata) external view returns(bytes4){return signer!=address(0)&&signer==owner()?bytes4(0x523e3260):bytes4(0);}
    function isValidSignature(bytes32,bytes calldata) external pure returns(bytes4){return bytes4(0);}
    function authorize(uint256 fee) private view {require(msg.sender==owner()&&payments.paid(address(this))&&msg.value>=fee,'AUTH');(,address circuit,uint256 id)=token();(,,,bool listed)=IROtapAccountMarket(market).listingFor(circuit,id);require(!listed,'LISTED');}
    function execute(address to,uint256 value,bytes calldata data,uint8 operation) external payable nonReentrant returns(bytes memory result){authorize(EXEC_FEE);require(operation==0,'OPERATION');payFee(EXEC_FEE);state++;return callTarget(to,value,data);}
    function executeBatch(address[] calldata to,uint256[] calldata value,bytes[] calldata data) external payable nonReentrant returns(bytes[] memory results){authorize(BATCH_FEE);require(to.length>0&&to.length==value.length&&to.length==data.length,'LENGTH');payFee(BATCH_FEE);state++;results=new bytes[](to.length);for(uint256 i;i<to.length;i++)results[i]=callTarget(to[i],value[i],data[i]);}
    function payFee(uint256 fee) private {if(fee>0){(bool ok,)=payable(treasury).call{value:fee}('');require(ok,'FEE');}if(msg.value>fee){(bool ok,)=payable(msg.sender).call{value:msg.value-fee}('');require(ok,'REFUND');}}
    function callTarget(address to,uint256 value,bytes memory data) private returns(bytes memory result){bool ok;(ok,result)=to.call{value:value}(data);if(!ok)assembly ("memory-safe"){revert(add(result,32),mload(result))}}
    function onERC721Received(address,address,uint256,bytes calldata) external view returns(bytes4){require(!IROtapAccountFactory(factory).isCPU(msg.sender),'NESTING');return 0x150b7a02;}
    function validMaterial(address candidate) private view returns(bool){try IROtapAccountMaterials(candidate).circuits() returns(address circuit){return IROtapAccountFactory(factory).isCPU(circuit);}catch{return false;}}
    function onERC1155Received(address,address,uint256,uint256,bytes calldata) external view returns(bytes4){require(validMaterial(msg.sender),'MATERIALS');return 0xf23a6e61;}
    function onERC1155BatchReceived(address,address,uint256[] calldata,uint256[] calldata,bytes calldata) external view returns(bytes4){require(validMaterial(msg.sender),'MATERIALS');return 0xbc197c81;}
    function supportsInterface(bytes4 id) external pure returns(bool){return id==0x01ffc9a7||id==0x150b7a02||id==0x4e2312e0||id==0x6faff5f1||id==0x51945447;}
}

contract ROtapAccountOpener {
    bytes32 public constant SALT=bytes32(0);IROtapERC6551Registry public immutable registry;address public immutable implementation;address public immutable factory;address public immutable treasury;ROtapAccountPayments public immutable payments;uint256 public immutable FEE;uint256 private entered;
    event Opened(address indexed circuits,uint256 indexed tokenId,address account);
    constructor(address registry_,address implementation_,address factory_,address treasury_,address payments_,uint256 fee_){require(registry_.code.length>0&&implementation_.code.length>0&&factory_.code.length>0&&payments_.code.length>0&&treasury_!=address(0),'CONFIG');registry=IROtapERC6551Registry(registry_);implementation=implementation_;factory=factory_;treasury=treasury_;payments=ROtapAccountPayments(payments_);FEE=fee_;}
    function accountOf(address circuits,uint256 tokenId) public view returns(address){return registry.account(implementation,SALT,block.chainid,circuits,tokenId);}
    function isDeployed(address circuits,uint256 id) external view returns(bool){return accountOf(circuits,id).code.length>0;}
    function isOpened(address circuits,uint256 id) public view returns(bool){return payments.paid(accountOf(circuits,id));}
    function isAccount(address candidate) external view returns(bool){return payments.paid(candidate);}
    function isProtocolCircuit(address candidate) external view returns(bool){return IROtapAccountFactory(factory).isCPU(candidate);}
    function open(address circuits,uint256 tokenId) external payable returns(address account){require(entered==0,'REENTRANCY');entered=1;require(msg.value>=FEE&&IROtapAccountFactory(factory).isCPU(circuits)&&!isOpened(circuits,tokenId),'PAYMENT');IROtapNFTOwner(circuits).ownerOf(tokenId);account=registry.createAccount(implementation,SALT,block.chainid,circuits,tokenId);payments.markPaid(account,msg.sender);if(FEE>0){(bool ok,)=payable(treasury).call{value:FEE}('');require(ok,'FEE');}if(msg.value>FEE){(bool ok,)=payable(msg.sender).call{value:msg.value-FEE}('');require(ok,'REFUND');}emit Opened(circuits,tokenId,account);entered=0;}
}

contract ROtapSiteRegistry {
    address public immutable factory;ROtapAccountOpener public immutable opener;
    struct Release {string cid;address publisher;uint64 publishedAt;}
    mapping(address=>uint256) public currentVersion;mapping(address=>mapping(uint256=>Release)) private releases;
    event SitePublished(address indexed container,address indexed circuits,uint256 indexed tokenId,uint256 version,string cid,address publisher);
    constructor(address factory_,address opener_){require(factory_.code.length>0&&opener_.code.length>0,'CONFIG');factory=factory_;opener=ROtapAccountOpener(opener_);}
    function validCID(string memory cid) public pure returns(bool){
        bytes memory text=bytes(cid);if(text.length!=59||text[0]!=0x62)return false;bytes memory decoded=new bytes(36);uint256 buffer;uint256 bits;uint256 offset;
        for(uint256 i=1;i<text.length;i++){uint8 ch=uint8(text[i]);uint256 value;if(ch>=97&&ch<=122)value=ch-97;else if(ch>=50&&ch<=55)value=ch-24;else return false;buffer=(buffer<<5)|value;bits+=5;if(bits>=8){bits-=8;decoded[offset++]=bytes1(uint8(buffer>>bits));buffer&=(uint256(1)<<bits)-1;}}
        return offset==36&&buffer==0&&decoded[0]==0x01&&decoded[1]==0x70&&decoded[2]==0x12&&decoded[3]==0x20;
    }

    function publish(address circuits,uint256 tokenId,uint256 expectedVersion,string calldata cid_) external returns(address container,uint256 version){require(IROtapAccountFactory(factory).isCPU(circuits)&&IROtapNFTOwner(circuits).ownerOf(tokenId)==msg.sender&&validCID(cid_),'AUTH');container=opener.accountOf(circuits,tokenId);require(opener.isOpened(circuits,tokenId)&&currentVersion[container]==expectedVersion,'VERSION');version=expectedVersion+1;currentVersion[container]=version;releases[container][version]=Release(cid_,msg.sender,uint64(block.timestamp));emit SitePublished(container,circuits,tokenId,version,cid_,msg.sender);}
    function release(address container,uint256 version) external view returns(Release memory){return releases[container][version];}
    function site(address container) external view returns(string memory cid,uint256 version,address publisher,uint64 publishedAt){version=currentVersion[container];Release storage item=releases[container][version];return(item.cid,version,item.publisher,item.publishedAt);}
}
