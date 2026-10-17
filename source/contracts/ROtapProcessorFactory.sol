// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import '@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol';
import '@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol';
import '@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol';
import './ROtapCircuits.sol';

interface IROtapOriginFactory {function isCPU(address) external view returns(bool);}
interface IROtapOriginCircuit {function factory() external view returns(address);}

/// Factory governance and processor registration follow the reference's owner-controlled model.
contract ROtapProcessorFactory is OwnableUpgradeable,UUPSUpgradeable {
    UpgradeableBeacon public transistorBeacon;
    UpgradeableBeacon public circuitBeacon;
    address public protocolWallet;
    uint256 public deployFee;
    uint256 public protocolFee;
    uint256 public defaultTapeoutFee;
    bool public isSealed;
    uint256 private entered;
    address[] public cpus;
    address[] public externalCpus;
    mapping(address=>bool) public isCPU;
    mapping(address=>address) public externalOrigin;
    mapping(address=>uint256) public owed;
    event CPUCreated(address indexed circuits,address indexed transistors,address indexed creator,string name,uint256 supply,uint256 mintPrice);
    event ExternalCPURegistered(address indexed circuits,address indexed transistors,address indexed origin);
    event DeployFeeSet(uint256 fee);
    event ProtocolFeeSet(uint256 fee);
    event ProtocolWalletSet(address wallet);
    event DefaultTapeoutFeeSet(uint256 fee);
    event Sealed();
    event Withdrawn(address indexed recipient,uint256 amount);
    modifier nonReentrant(){require(entered==0,'REENTRANCY');entered=1;_;entered=0;}
    constructor(){_disableInitializers();}
    function initialize(address owner_,address transistorImpl,address circuitImpl,address wallet,uint256 deploymentFee,uint256 mintProtocolFee) external initializer {
        require(wallet!=address(0),'ZERO');__Ownable_init(owner_);__UUPSUpgradeable_init();
        transistorBeacon=new UpgradeableBeacon(transistorImpl,address(this));circuitBeacon=new UpgradeableBeacon(circuitImpl,address(this));
        protocolWallet=wallet;deployFee=deploymentFee;protocolFee=mintProtocolFee;
        // Release configuration must explicitly confirm the native-token conversion before creation.
        defaultTapeoutFee=63_570_000_000_000;
    }
    function cpuCount() external view returns(uint256){return cpus.length;}
    function externalCpuCount() external view returns(uint256){return externalCpus.length;}
    function cpuAt(uint256 index) external view returns(address){return cpus[index];}
    function createCPU(string calldata name_,string calldata symbol_,string calldata story_,uint256 supply,uint256 price) external payable onlyOwner nonReentrant returns(address transistorsAddr,address circuitsAddr){
        require(!isSealed&&msg.value>=deployFee,'deploy fee');
        transistorsAddr=address(new BeaconProxy(address(transistorBeacon),''));circuitsAddr=address(new BeaconProxy(address(circuitBeacon),''));
        ROtapTransistors(transistorsAddr).initialize(name_,symbol_,story_,msg.sender,supply,price,protocolWallet,protocolFee,circuitsAddr);
        ROtapCircuits(circuitsAddr).initialize(name_,symbol_,transistorsAddr,address(this));
        isCPU[circuitsAddr]=true;cpus.push(circuitsAddr);owed[protocolWallet]+=deployFee;
        if(msg.value>deployFee)owed[msg.sender]+=msg.value-deployFee;
        emit CPUCreated(circuitsAddr,transistorsAddr,msg.sender,name_,supply,price);
    }
    function registerExternalCPU(address origin,address circuits) external onlyOwner {
        require(!isSealed&&origin!=address(this)&&origin.code.length>0&&circuits.code.length>0,'origin');
        require(!isCPU[circuits]&&IROtapOriginFactory(origin).isCPU(circuits)&&IROtapOriginCircuit(circuits).factory()==origin,'origin');
        isCPU[circuits]=true;externalOrigin[circuits]=origin;externalCpus.push(circuits);emit ExternalCPURegistered(circuits,ROtapCircuits(circuits).transistorsContract(),origin);
    }
    function setDeployFee(uint256 fee) external onlyOwner {deployFee=fee;emit DeployFeeSet(fee);}
    function setProtocolFee(uint256 fee) external onlyOwner {protocolFee=fee;emit ProtocolFeeSet(fee);}
    function setProtocolWallet(address wallet) external onlyOwner {require(wallet!=address(0),'ZERO');protocolWallet=wallet;emit ProtocolWalletSet(wallet);}
    function setDefaultTapeoutFee(uint256 fee) external onlyOwner {defaultTapeoutFee=fee;emit DefaultTapeoutFeeSet(fee);}
    function upgradeTransistors(address implementation) external onlyOwner {transistorBeacon.upgradeTo(implementation);}
    function upgradeCircuits(address implementation) external onlyOwner {circuitBeacon.upgradeTo(implementation);}
    function configureCPU(address circuits,address mining,address accounts) external onlyOwner {
        require(isCPU[circuits]&&externalOrigin[circuits]==address(0),'CPU');
        if(mining!=address(0))ROtapCircuits(circuits).configureMining(mining);
        if(accounts!=address(0))ROtapCircuits(circuits).configureAccounts(accounts);
    }
    function withdraw() external nonReentrant {uint256 amount=owed[msg.sender];require(amount>0,'NOTHING');owed[msg.sender]=0;(bool ok,)=payable(msg.sender).call{value:amount}('');require(ok,'TRANSFER');emit Withdrawn(msg.sender,amount);}
    function seal() external onlyOwner {isSealed=true;transistorBeacon.renounceOwnership();circuitBeacon.renounceOwnership();_transferOwnership(address(0));emit Sealed();}
    function _authorizeUpgrade(address) internal override onlyOwner {require(!isSealed,'SEALED');}
}

contract ROtapFactoryProxy is ERC1967Proxy {
    constructor(address implementation,bytes memory initialization) payable ERC1967Proxy(implementation,initialization) {}
}
