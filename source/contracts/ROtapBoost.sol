// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import './ROtapRewardStakeBoost.sol';
interface IROtapMiningLedger {function ledger() external view returns(address);}
interface IROtapBoostLedger {function startTime() external view returns(uint256);function HALVING_PERIOD() external view returns(uint256);function token() external view returns(address);}
contract ROtapBoost is ROtapRewardStakeBoost {
    uint256 public constant MAX_BOOST_BPS=5000;
    uint256 public constant BURN_WINDOW=180 days;
    uint256[5] public burnTiers;
    address public immutable treasury;
    IROtapBoostLedger public immutable rewardLedger;
    uint256 public totalBurned;
    struct Burn {uint16 bps;uint64 until;}
    mapping(address=>Burn) public burns;
    event Burned(address indexed account,uint256 amount,uint256 bps,uint256 until);
    constructor(address mining_,uint256[5] memory stakeMins,address token_,address treasury_,uint256[5] memory burnMins)
        ROtapRewardStakeBoost(mining_,stakeMins,token_) {
        require(treasury_!=address(0),'ZERO');treasury=treasury_;
        rewardLedger=IROtapBoostLedger(IROtapMiningLedger(mining_).ledger());
        require(rewardLedger.token()==token_,'REWARD_TOKEN');
        for(uint256 i;i<5;i++)require(burnMins[i]>0&&(i==0||burnMins[i]>burnMins[i-1]),'TIERS');burnTiers=burnMins;
    }
    function startTime() public view returns(uint256){return rewardLedger.startTime();}
    function eraLength() public view returns(uint256){return rewardLedger.HALVING_PERIOD();}
    function burnBpsNow() public view returns(uint256){
        uint256 genesis=startTime();if(block.timestamp<genesis)return 0;uint256 elapsed=block.timestamp-genesis;
        uint256 period=eraLength();if(period==0)return 0;uint256 era=elapsed/period;
        if(era>=4||elapsed%period>=BURN_WINDOW)return 0;return 1600-era*400;
    }
    function burnDurationOf(uint256 amount) public view returns(uint256){
        uint256[5] memory durations=[uint256(7 days),14 days,28 days,60 days,180 days];
        for(uint256 i=5;i>0;i--)if(amount>=burnTiers[i-1])return durations[i-1];return 0;
    }
    function burnBpsOf(address account) public view returns(uint256){Burn memory b=burns[account];return block.timestamp<b.until?b.bps:0;}
    function factorBps(address account) public view override returns(uint256){
        uint256 extra=stakeBpsOf(account)+rewardStakeBpsOf(rewardStaked[account])+burnBpsOf(account);
        return 10000+(extra>MAX_BOOST_BPS?MAX_BOOST_BPS:extra);
    }
    function burn() external payable nonReentrant {burnInternal(new bytes32[](0),false);}
    function burnWithKeys(bytes32[] calldata keys) external payable nonReentrant {burnInternal(keys,true);}
    function burnInternal(bytes32[] memory keys,bool selected) private {
        require(burns[msg.sender].until<=block.timestamp,'ACTIVE');uint256 bps=burnBpsNow();require(bps>0,'CLOSED');
        uint256 duration=burnDurationOf(msg.value);require(duration>0,'AMOUNT');
        beforeChange(keys,selected);
        uint256 until=block.timestamp+duration;require(until<=type(uint64).max,'TIME');burns[msg.sender]=Burn(uint16(bps),uint64(until));totalBurned+=msg.value;
        (bool ok,)=payable(treasury).call{value:msg.value}('');require(ok,'TRANSFER');
        afterChange(keys,selected);emit Burned(msg.sender,msg.value,bps,until);
    }
}
