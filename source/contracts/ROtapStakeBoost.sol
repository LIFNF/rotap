// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IROtapBoostSync {function beforeFactorChange(address holder) external;function afterFactorChange(address holder) external;function beforeFactorChangeForKeys(address holder,bytes32[] calldata keys) external;function afterFactorChangeForKeys(address holder,bytes32[] calldata keys) external;}

/// Native-asset staking candidate; ETH thresholds must be fixed in the final release manifest.
contract ROtapStakeBoost {
    uint256 public constant UNSTAKE_DELAY=7 days;
    uint256[5] public stakeTiers;
    uint256[5] public stakeBoosts=[uint256(500),700,900,1200,1500];
    address public immutable mining;
    mapping(address=>uint256) public staked;
    struct Exit {uint256 amount;uint256 unlockAt;}
    mapping(address=>Exit) public unstaking;
    uint256 public totalStaked;uint256 public totalUnstaking;
    uint256 private entered;
    event Staked(address indexed account,uint256 amount);
    event Unstaked(address indexed account,uint256 amount,uint256 unlockAt);
    event Withdrawn(address indexed account,uint256 amount);
    modifier nonReentrant(){require(entered==0,'REENTRANCY');entered=1;_;entered=0;}
    constructor(address mining_,uint256[5] memory tiers){
        require(mining_.code.length>0,'MINING');mining=mining_;
        for(uint256 i;i<5;i++)require(tiers[i]>0&&(i==0||tiers[i]>tiers[i-1]),'TIERS');stakeTiers=tiers;
    }
    function stakeBpsOf(address account) public view returns(uint256){uint256 amount=staked[account];for(uint256 i=5;i>0;i--)if(amount>=stakeTiers[i-1])return stakeBoosts[i-1];return 0;}
    function factorBps(address account) public view virtual returns(uint256){return 10000+stakeBpsOf(account);}
    function beforeChange(bytes32[] memory keys,bool selected) internal {if(selected)IROtapBoostSync(mining).beforeFactorChangeForKeys(msg.sender,keys);else IROtapBoostSync(mining).beforeFactorChange(msg.sender);}
    function afterChange(bytes32[] memory keys,bool selected) internal {if(selected)IROtapBoostSync(mining).afterFactorChangeForKeys(msg.sender,keys);else IROtapBoostSync(mining).afterFactorChange(msg.sender);}
    function stake() external payable nonReentrant {stakeInternal(new bytes32[](0),false);}
    function stakeWithKeys(bytes32[] calldata keys) external payable nonReentrant {stakeInternal(keys,true);}
    function stakeInternal(bytes32[] memory keys,bool selected) private {
        require(msg.value>0,'AMOUNT');beforeChange(keys,selected);
        staked[msg.sender]+=msg.value;totalStaked+=msg.value;
        afterChange(keys,selected);emit Staked(msg.sender,msg.value);
    }
    function unstake(uint256 amount) external nonReentrant {unstakeInternal(amount,new bytes32[](0),false);}
    function unstakeWithKeys(uint256 amount,bytes32[] calldata keys) external nonReentrant {unstakeInternal(amount,keys,true);}
    function unstakeInternal(uint256 amount,bytes32[] memory keys,bool selected) private {
        require(amount>0&&staked[msg.sender]>=amount,'BALANCE');beforeChange(keys,selected);
        staked[msg.sender]-=amount;totalStaked-=amount;totalUnstaking+=amount;
        Exit storage exit=unstaking[msg.sender];exit.amount+=amount;exit.unlockAt=block.timestamp+UNSTAKE_DELAY;
        afterChange(keys,selected);emit Unstaked(msg.sender,amount,exit.unlockAt);
    }
    function withdraw(address account) external nonReentrant {
        Exit memory exit=unstaking[account];require(exit.amount>0&&block.timestamp>=exit.unlockAt,'LOCKED');
        delete unstaking[account];totalUnstaking-=exit.amount;
        (bool ok,)=payable(account).call{value:exit.amount}('');require(ok,'TRANSFER');emit Withdrawn(account,exit.amount);
    }
}
