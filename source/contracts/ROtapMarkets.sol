// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
interface IROtap1155 {function safeTransferFrom(address,address,uint256,uint256,bytes calldata) external;function circuits() external view returns(address);}
interface IROtap721 {function ownerOf(uint256) external view returns(address);function transferFrom(address,address,uint256) external;function getApproved(uint256) external view returns(address);function isApprovedForAll(address,address) external view returns(bool);function factory() external view returns(address);function transistors() external view returns(address);}
interface IROtapMarketFactory {function isCPU(address) external view returns(bool);}

abstract contract ROtapFeeVault is OwnableUpgradeable,UUPSUpgradeable {
    uint16 public constant MAX_FEE_BPS=300;
    address public protocolWallet;address public factory;uint16 public feeBps;bool public isSealed;
    mapping(address=>bool) public externalFactories;mapping(address=>uint256) public owed;uint256 private entered;
    event FeeBpsSet(uint16 fee);event ProtocolWalletSet(address wallet);event ExternalFactorySet(address indexed origin,bool allowed);event Sealed();event Withdrawn(address indexed recipient,uint256 amount);
    modifier nonReentrant(){require(entered==0,'REENTRANCY');entered=1;_;entered=0;}
    constructor(address treasury,address factory_){_disableInitializers();if(treasury!=address(0)){require(factory_.code.length>0,'FACTORY');_transferOwnership(msg.sender);protocolWallet=treasury;factory=factory_;feeBps=100;}}
    function initialize(address owner_,address factory_,address treasury,uint16 fee) external initializer {require(factory_.code.length>0&&treasury!=address(0)&&fee<=MAX_FEE_BPS,'CONFIG');__Ownable_init(owner_);__UUPSUpgradeable_init();factory=factory_;protocolWallet=treasury;feeBps=fee;_initializeMarketState();}
    function _initializeMarketState() internal virtual {}
    function setFeeBps(uint16 fee) external onlyOwner {require(fee<=MAX_FEE_BPS,'FEE');feeBps=fee;emit FeeBpsSet(fee);}
    function setProtocolWallet(address wallet) external onlyOwner {require(wallet!=address(0),'ZERO');protocolWallet=wallet;emit ProtocolWalletSet(wallet);}
    function setExternalFactory(address origin,bool allowed) external onlyOwner {require(origin.code.length>0,'FACTORY');externalFactories[origin]=allowed;emit ExternalFactorySet(origin,allowed);}
    function validCircuit(address circuit) internal view returns(bool){if(circuit.code.length==0)return false;try IROtapMarketFactory(factory).isCPU(circuit) returns(bool registered){if(registered)return true;}catch{}try IROtap721(circuit).factory() returns(address origin){return externalFactories[origin]&&IROtapMarketFactory(origin).isCPU(circuit);}catch{return false;}}
    function validMaterial(address material) internal view returns(bool){if(material.code.length==0)return false;try IROtap1155(material).circuits() returns(address circuit){return validCircuit(circuit)&&IROtap721(circuit).transistors()==material;}catch{return false;}}
    function saleCredit(address seller,uint256 gross,uint16 rate) internal {uint256 fee=gross*rate/10000;owed[protocolWallet]+=fee;uint256 proceeds=gross-fee;(bool ok,)=payable(seller).call{value:proceeds}('');require(ok,'TRANSFER');}
    function withdraw() external nonReentrant {uint256 amount=owed[msg.sender];require(amount>0,'NOTHING');owed[msg.sender]=0;(bool ok,)=payable(msg.sender).call{value:amount}('');require(ok,'TRANSFER');emit Withdrawn(msg.sender,amount);}
    function seal() external onlyOwner {isSealed=true;_transferOwnership(address(0));emit Sealed();}
    function _authorizeUpgrade(address) internal override onlyOwner {require(!isSealed,'SEALED');}
}

contract ROtapTransistorMarket is ROtapFeeVault {
    struct Order {address maker;address transistors;uint96 price;uint8 tokenId;uint16 feeBps;uint256 remaining;}
    uint256 public nextAskId;uint256 public nextBidId;
    mapping(uint256=>Order) public asks;mapping(uint256=>Order) public bids;
    event AskPlaced(uint256 indexed orderId,address indexed maker,address indexed transistors,uint8 tokenId,uint96 price,uint256 quantity);
    event BidPlaced(uint256 indexed orderId,address indexed maker,address indexed transistors,uint8 tokenId,uint96 price,uint256 quantity);
    event Filled(bool indexed ask,uint256 indexed orderId,address indexed taker,uint256 amount);event Cancelled(bool indexed ask,uint256 indexed orderId);
    constructor(address treasury,address factory_) ROtapFeeVault(treasury,factory_){}
    function _initializeMarketState() internal override {}
    function askRemaining(uint256 id) external view returns(uint256){return asks[id].remaining;}
    function bidRemaining(uint256 id) external view returns(uint256){return bids[id].remaining;}
    function placeAsk(address material,uint8 id,uint96 price,uint256 amount) external nonReentrant returns(uint256 orderId){require(validMaterial(material)&&id<2&&amount>0&&price>0,'ORDER');orderId=++nextAskId;asks[orderId]=Order(msg.sender,material,price,id,feeBps,amount);IROtap1155(material).safeTransferFrom(msg.sender,address(this),id,amount,'');emit AskPlaced(orderId,msg.sender,material,id,price,amount);}
    function placeBid(address material,uint8 id,uint96 price,uint256 amount) external payable nonReentrant returns(uint256 orderId){require(validMaterial(material)&&id<2&&amount>0&&price>0&&msg.value==amount*price,'ORDER');orderId=++nextBidId;bids[orderId]=Order(msg.sender,material,price,id,feeBps,amount);emit BidPlaced(orderId,msg.sender,material,id,price,amount);}
    function fillAsk(uint256 id,uint256 amount) external payable nonReentrant {Order storage order=asks[id];require(amount>0&&amount<=order.remaining,'ORDER');uint256 gross=amount*order.price;require(msg.value==gross,'PAYMENT');order.remaining-=amount;saleCredit(order.maker,gross,order.feeBps);IROtap1155(order.transistors).safeTransferFrom(address(this),msg.sender,order.tokenId,amount,'');emit Filled(true,id,msg.sender,amount);}
    function fillBid(uint256 id,uint256 amount) external nonReentrant {Order storage order=bids[id];require(amount>0&&amount<=order.remaining,'ORDER');order.remaining-=amount;saleCredit(msg.sender,amount*order.price,order.feeBps);IROtap1155(order.transistors).safeTransferFrom(msg.sender,order.maker,order.tokenId,amount,'');emit Filled(false,id,msg.sender,amount);}
    function cancelAsk(uint256 id) external nonReentrant {Order storage order=asks[id];require(order.maker==msg.sender&&order.remaining>0,'AUTH');uint256 quantity=order.remaining;order.remaining=0;IROtap1155(order.transistors).safeTransferFrom(address(this),msg.sender,order.tokenId,quantity,'');emit Cancelled(true,id);}
    function cancelBid(uint256 id) external nonReentrant {Order storage order=bids[id];require(order.maker==msg.sender&&order.remaining>0,'AUTH');uint256 refund=order.remaining*order.price;order.remaining=0;(bool ok,)=payable(msg.sender).call{value:refund}('');require(ok,'REFUND');emit Cancelled(false,id);}
    function onERC1155Received(address,address,uint256,uint256,bytes calldata) external view returns(bytes4){require(validMaterial(msg.sender),'TOKEN');return 0xf23a6e61;}
    function onERC1155BatchReceived(address,address,uint256[] calldata,uint256[] calldata,bytes calldata) external pure returns(bytes4){return 0xbc197c81;}
    function supportsInterface(bytes4 interfaceId) external pure returns(bool){return interfaceId==0x01ffc9a7||interfaceId==0x4e2312e0;}
}

contract ROtapCircuitMarket is ROtapFeeVault {
    struct Listing {address seller;address circuits;uint96 price;uint16 feeBps;uint256 tokenId;bool active;}
    uint256 public nextListingId;mapping(uint256=>Listing) private items;mapping(address=>mapping(uint256=>uint256)) public listingOf;
    event Listed(uint256 indexed listingId,address indexed seller,address indexed circuits,uint256 tokenId,uint96 price);event Bought(uint256 indexed listingId,address indexed buyer);event Delisted(uint256 indexed listingId);
    constructor(address treasury,address factory_) ROtapFeeVault(treasury,factory_){}
    function _initializeMarketState() internal override {}
    function listings(uint256 id) external view returns(address seller,address circuits,uint96 price,uint16 fee,uint256 tokenId){Listing storage item=items[id];return(item.seller,item.circuits,item.price,item.feeBps,item.tokenId);}
    function listingView(uint256 id) public view returns(address seller,address circuits,uint256 tokenId,uint96 price,uint16 fee,bool active){Listing storage item=items[id];return(item.seller,item.circuits,item.tokenId,item.price,item.feeBps,item.active);}
    function listingFor(address circuit,uint256 tokenId) external view returns(uint256 id,address seller,uint96 price,bool active){id=listingOf[circuit][tokenId];Listing storage item=items[id];return(id,item.seller,item.price,item.active);}
    function list(address circuit,uint256 tokenId,uint96 price) external nonReentrant returns(uint256 id){require(validCircuit(circuit)&&price>0&&IROtap721(circuit).ownerOf(tokenId)==msg.sender,'OWNER');require(IROtap721(circuit).getApproved(tokenId)==address(this)||IROtap721(circuit).isApprovedForAll(msg.sender,address(this)),'APPROVAL');uint256 old=listingOf[circuit][tokenId];if(old!=0)items[old].active=false;id=++nextListingId;items[id]=Listing(msg.sender,circuit,price,feeBps,tokenId,true);listingOf[circuit][tokenId]=id;emit Listed(id,msg.sender,circuit,tokenId,price);}
    function setPrice(uint256 id,uint96 price) external {Listing storage item=items[id];require(item.active&&item.seller==msg.sender&&price>0,'AUTH');item.price=price;}
    function deactivate(uint256 id) private {Listing storage item=items[id];item.active=false;delete listingOf[item.circuits][item.tokenId];emit Delisted(id);}
    function delist(uint256 id) external {Listing storage item=items[id];require(item.active&&item.seller==msg.sender,'AUTH');deactivate(id);}
    function delistStale(uint256 id) external {Listing storage item=items[id];IROtap721 circuit=IROtap721(item.circuits);require(item.active&&(circuit.ownerOf(item.tokenId)!=item.seller||(circuit.getApproved(item.tokenId)!=address(this)&&!circuit.isApprovedForAll(item.seller,address(this)))),'CURRENT');deactivate(id);}
    function buy(uint256 id,uint96 expectedPrice) external payable nonReentrant {Listing storage item=items[id];require(item.active&&item.price==expectedPrice&&msg.value==item.price&&IROtap721(item.circuits).ownerOf(item.tokenId)==item.seller,'LISTING');item.active=false;delete listingOf[item.circuits][item.tokenId];saleCredit(item.seller,item.price,item.feeBps);IROtap721(item.circuits).transferFrom(item.seller,msg.sender,item.tokenId);emit Bought(id,msg.sender);}
}
