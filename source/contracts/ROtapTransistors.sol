// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Independent implementation candidate. Full Fab X equivalence remains unverified.
contract ROtapTransistors {
    uint256 public constant NAND=0;
    uint256 public constant LATCH=1;
    uint256 public supplyCap;
    uint256 public mintPrice;
    uint256 public protocolFee;
    address public creator;
    address public protocolWallet;
    address public circuits;
    string public cpuName;
    string public cpuSymbol;
    string public story;
    uint256 public walletCap;
    mapping(uint256=>uint256) public typeCap;
    bool private initialized;
    uint256 public minted;
    mapping(uint256=>uint256) public mintedOf;
    mapping(address=>uint256) public mintedBy;
    mapping(uint256=>mapping(address=>uint256)) private balances;
    mapping(address=>mapping(address=>bool)) public isApprovedForAll;
    uint256 private entered;
    event TransferSingle(address indexed operator,address indexed from,address indexed to,uint256 id,uint256 value);
    event TransferBatch(address indexed operator,address indexed from,address indexed to,uint256[] ids,uint256[] values);
    event ApprovalForAll(address indexed account,address indexed operator,bool approved);
    event MintPaymentForwarded(address indexed creator,address indexed protocolWallet,uint256 price,uint256 fee);
    modifier nonReentrant(){require(entered==0,"REENTRANCY");entered=1;_;entered=0;}
    constructor(address creator_,address protocolWallet_,address circuits_,uint256 price_,uint256 fee_){
        initialized=true;
        if(creator_!=address(0))_initialize('ROtap','ROTAP','',creator_,1_000_000,price_,protocolWallet_,fee_,circuits_);
    }
    function initialize(string calldata name_,string calldata symbol_,string calldata story_,address creator_,uint256 supplyCap_,uint256 price_,address wallet_,uint256 fee_,address circuits_) external {
        require(!initialized,"INITIALIZED");initialized=true;_initialize(name_,symbol_,story_,creator_,supplyCap_,price_,wallet_,fee_,circuits_);
    }
    function _initialize(string memory name_,string memory symbol_,string memory story_,address creator_,uint256 cap_,uint256 price_,address wallet_,uint256 fee_,address circuits_) private {
        require(creator_!=address(0)&&wallet_!=address(0)&&circuits_!=address(0),"ZERO");creator=creator_;protocolWallet=wallet_;circuits=circuits_;mintPrice=price_;protocolFee=fee_;supplyCap=cap_;cpuName=name_;cpuSymbol=symbol_;story=story_;
    }
    function supportsInterface(bytes4 id) external pure returns(bool){return id==0x01ffc9a7||id==0xd9b67a26||id==0x0e89341c;}
    function uri(uint256 id) external view returns(string memory){require(id<=LATCH,"TYPE");return string.concat('data:application/json;base64,',ROtapMetadata.base64(bytes(string.concat('{"name":"',ROtapMetadata.escape(cpuName),id==NAND?' NAND':' LATCH','","description":"',ROtapMetadata.escape(story),'","decimals":0}'))));}
    function balanceOf(address account,uint256 id) public view returns(uint256){require(account!=address(0),"ZERO");return balances[id][account];}
    function balanceOfBatch(address[] calldata accounts,uint256[] calldata ids) external view returns(uint256[] memory result){
        require(accounts.length==ids.length,"LENGTH");result=new uint256[](ids.length);
        for(uint256 i;i<ids.length;i++)result[i]=balanceOf(accounts[i],ids[i]);
    }
    function quoteMint(address account,uint256 amount) external view returns(uint256){account;return mintPrice*amount+protocolFee;}
    function mint(uint256 id,uint256 amount) external payable nonReentrant {
        require(id<=LATCH&&amount>0,"AMOUNT");require(minted+amount<=supplyCap,"SUPPLY");
        require(typeCap[id]==0||mintedOf[id]+amount<=typeCap[id],"TYPE_CAP");require(walletCap==0||mintedBy[msg.sender]+amount<=walletCap,"WALLET_CAP");
        uint256 price=mintPrice*amount;uint256 fee=protocolFee;
        require(msg.value==price+fee,"PAYMENT");
        minted+=amount;mintedOf[id]+=amount;mintedBy[msg.sender]+=amount;
        balances[id][msg.sender]+=amount;
        emit TransferSingle(msg.sender,address(0),msg.sender,id,amount);
        accept(msg.sender,address(0),msg.sender,id,amount,"");
        if(creator==protocolWallet){if(msg.value>0){(bool ok,)=payable(creator).call{value:msg.value}("");require(ok,"PAYMENT_FORWARD");}}else{if(price>0){(bool ok,)=payable(creator).call{value:price}("");require(ok,"PRICE_FORWARD");}if(fee>0){(bool ok,)=payable(protocolWallet).call{value:fee}("");require(ok,"FEE_FORWARD");}}
        emit MintPaymentForwarded(creator,protocolWallet,price,fee);
    }
    function setApprovalForAll(address operator,bool approved) external {
        require(operator!=msg.sender,"SELF");isApprovedForAll[msg.sender][operator]=approved;
        emit ApprovalForAll(msg.sender,operator,approved);
    }
    function safeTransferFrom(address from,address to,uint256 id,uint256 amount,bytes calldata data) external {
        require(msg.sender==from||isApprovedForAll[from][msg.sender],"AUTH");move(from,to,id,amount);
        emit TransferSingle(msg.sender,from,to,id,amount);accept(msg.sender,from,to,id,amount,data);
    }
    function safeBatchTransferFrom(address from,address to,uint256[] calldata ids,uint256[] calldata amounts,bytes calldata data) external {
        require(msg.sender==from||isApprovedForAll[from][msg.sender],"AUTH");require(ids.length==amounts.length,"LENGTH");
        for(uint256 i;i<ids.length;i++)move(from,to,ids[i],amounts[i]);
        emit TransferBatch(msg.sender,from,to,ids,amounts);
        if(to.code.length>0){(bool ok,bytes memory result)=to.call(abi.encodeWithSignature("onERC1155BatchReceived(address,address,uint256[],uint256[],bytes)",msg.sender,from,ids,amounts,data));require(ok&&result.length>=32&&abi.decode(result,(bytes4))==0xbc197c81,"RECEIVER");}
    }
    function burnFrom(address from,uint256 id,uint256 amount) external {
        require(msg.sender==circuits,"AUTH");require(balances[id][from]>=amount,"BALANCE");
        balances[id][from]-=amount;emit TransferSingle(msg.sender,from,address(0),id,amount);
    }
    function move(address from,address to,uint256 id,uint256 amount) private {
        require(to!=address(0)&&balances[id][from]>=amount,"BALANCE");balances[id][from]-=amount;balances[id][to]+=amount;
    }
    function accept(address operator,address from,address to,uint256 id,uint256 amount,bytes memory data) private {
        if(to.code.length>0){(bool ok,bytes memory result)=to.call(abi.encodeWithSignature("onERC1155Received(address,address,uint256,uint256,bytes)",operator,from,id,amount,data));require(ok&&result.length>=32&&abi.decode(result,(bytes4))==0xf23a6e61,"RECEIVER");}
    }
}

library ROtapMetadata {
    function decimal(uint256 value) internal pure returns(string memory){if(value==0)return '0';uint256 v=value;uint256 n;while(v>0){n++;v/=10;}bytes memory out=new bytes(n);while(value>0){out[--n]=bytes1(uint8(48+value%10));value/=10;}return string(out);}
    function escape(string memory value) internal pure returns(string memory){bytes memory input=bytes(value);bytes memory out=new bytes(input.length*6);bytes16 hexes='0123456789abcdef';uint256 n;for(uint256 i;i<input.length;i++){uint8 b=uint8(input[i]);if(b==34||b==92){out[n++]=0x5c;out[n++]=input[i];}else if(b<32){out[n++]=0x5c;out[n++]='u';out[n++]='0';out[n++]='0';out[n++]=hexes[b>>4];out[n++]=hexes[b&15];}else out[n++]=input[i];}assembly ("memory-safe"){mstore(out,n)}return string(out);}
    function base64(bytes memory input) internal pure returns(string memory){bytes memory alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';bytes memory out=new bytes(4*((input.length+2)/3));uint256 j;for(uint256 i;i<input.length;i+=3){uint256 v=uint256(uint8(input[i]))<<16;if(i+1<input.length)v|=uint256(uint8(input[i+1]))<<8;if(i+2<input.length)v|=uint8(input[i+2]);out[j++]=alphabet[(v>>18)&63];out[j++]=alphabet[(v>>12)&63];out[j++]=i+1<input.length?alphabet[(v>>6)&63]:bytes1('=');out[j++]=i+2<input.length?alphabet[v&63]:bytes1('=');}return string(out);}
}
