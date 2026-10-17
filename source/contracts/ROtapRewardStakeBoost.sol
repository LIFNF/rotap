// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import './ROtapStakeBoost.sol';

interface IROtapStakeToken {
    function decimals() external view returns(uint8);
    function balanceOf(address account) external view returns(uint256);
    function transferFrom(address from,address to,uint256 amount) external returns(bool);
    function transfer(address to,uint256 amount) external returns(bool);
}

/// User-authorized asset adaptation: ROTAP replaces the reference BEM staking asset.
contract ROtapRewardStakeBoost is ROtapStakeBoost {
    IROtapStakeToken public immutable rewardToken;
    uint256[5] public rewardStakeTiers=[uint256(200e8),600e8,1000e8,1500e8,2000e8];
    mapping(address=>uint256) public rewardStaked;
    mapping(address=>Exit) public rewardUnstaking;
    uint256 public totalRewardStaked;
    uint256 public totalRewardUnstaking;
    event RewardStaked(address indexed account,uint256 amount);
    event RewardUnstaked(address indexed account,uint256 amount,uint256 unlockAt);
    event RewardWithdrawn(address indexed account,uint256 amount);

    constructor(address mining_,uint256[5] memory nativeTiers,address token_) ROtapStakeBoost(mining_,nativeTiers) {
        require(token_.code.length>0,'TOKEN');
        rewardToken=IROtapStakeToken(token_);
        require(rewardToken.decimals()==8,'DECIMALS');
    }
    function rewardStakeBpsOf(uint256 amount) public view returns(uint256){
        for(uint256 i=5;i>0;i--)if(amount>=rewardStakeTiers[i-1])return stakeBoosts[i-1];return 0;
    }
    function factorBps(address account) public view virtual override returns(uint256){
        return 10000+stakeBpsOf(account)+rewardStakeBpsOf(rewardStaked[account]);
    }
    function stakeReward(uint256 amount) external nonReentrant {stakeRewardInternal(amount,new bytes32[](0),false);}
    function stakeRewardWithKeys(uint256 amount,bytes32[] calldata keys) external nonReentrant {stakeRewardInternal(amount,keys,true);}
    function stakeRewardInternal(uint256 amount,bytes32[] memory keys,bool selected) private {
        require(amount>0,'AMOUNT');beforeChange(keys,selected);
        uint256 beforeBalance=rewardToken.balanceOf(address(this));
        require(rewardToken.transferFrom(msg.sender,address(this),amount),'TRANSFER');
        require(rewardToken.balanceOf(address(this))==beforeBalance+amount,'TOKEN_AMOUNT');
        rewardStaked[msg.sender]+=amount;totalRewardStaked+=amount;
        afterChange(keys,selected);emit RewardStaked(msg.sender,amount);
    }
    function unstakeReward(uint256 amount) external nonReentrant {unstakeRewardInternal(amount,new bytes32[](0),false);}
    function unstakeRewardWithKeys(uint256 amount,bytes32[] calldata keys) external nonReentrant {unstakeRewardInternal(amount,keys,true);}
    function unstakeRewardInternal(uint256 amount,bytes32[] memory keys,bool selected) private {
        require(amount>0&&rewardStaked[msg.sender]>=amount,'BALANCE');
        beforeChange(keys,selected);
        rewardStaked[msg.sender]-=amount;totalRewardStaked-=amount;totalRewardUnstaking+=amount;
        Exit storage exit=rewardUnstaking[msg.sender];exit.amount+=amount;exit.unlockAt=block.timestamp+UNSTAKE_DELAY;
        afterChange(keys,selected);emit RewardUnstaked(msg.sender,amount,exit.unlockAt);
    }
    function withdrawReward(address account) external nonReentrant {
        Exit memory exit=rewardUnstaking[account];require(exit.amount>0&&block.timestamp>=exit.unlockAt,'LOCKED');
        delete rewardUnstaking[account];totalRewardUnstaking-=exit.amount;
        require(rewardToken.transfer(account,exit.amount),'TRANSFER');emit RewardWithdrawn(account,exit.amount);
    }
}
