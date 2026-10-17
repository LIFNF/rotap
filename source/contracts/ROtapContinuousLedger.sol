// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Candidate continuous emission accounting; original-chain rounding parity is pending.
library ROtapEmission {
    function between(uint256 from,uint256 until,uint256 genesis,uint256 period,uint256 initialDailyEmission) internal pure returns(uint256 amount){
        require(period>0,'PERIOD');if(until<=from||until<=genesis)return 0;if(from<genesis)from=genesis;
        while(from<until){uint256 era=(from-genesis)/period;if(era>=256)break;
            uint256 daily=initialDailyEmission>>era;if(daily==0)break;
            uint256 boundary=genesis+(era+1)*period;uint256 end=until<boundary?until:boundary;
            uint256 eraStart=genesis+era*period;amount+=(end-eraStart)*daily/86400-(from-eraStart)*daily/86400;from=end;
        }
    }
}

contract ROtapContinuousReward {
    string public constant name='ROtap';string public constant symbol='ROTAP';uint8 public constant decimals=8;
    uint256 public constant cap=20_000_000*10**8;
    address public immutable minter;uint256 public totalSupply;
    mapping(address=>uint256) public balanceOf;mapping(address=>mapping(address=>uint256)) public allowance;
    event Transfer(address indexed from,address indexed to,uint256 amount);event Approval(address indexed owner,address indexed spender,uint256 amount);
    constructor(){minter=msg.sender;totalSupply=cap;balanceOf[msg.sender]=cap;emit Transfer(address(0),msg.sender,cap);}
    function approve(address spender,uint256 amount) external returns(bool){allowance[msg.sender][spender]=amount;emit Approval(msg.sender,spender,amount);return true;}
    function transfer(address to,uint256 amount) external returns(bool){move(msg.sender,to,amount);return true;}
    function transferFrom(address from,address to,uint256 amount) external returns(bool){uint256 allowed=allowance[from][msg.sender];require(allowed>=amount,'ALLOWANCE');if(allowed!=type(uint256).max)allowance[from][msg.sender]=allowed-amount;move(from,to,amount);return true;}
    function move(address from,address to,uint256 amount) private {require(to!=address(0)&&balanceOf[from]>=amount,'BALANCE');balanceOf[from]-=amount;balanceOf[to]+=amount;emit Transfer(from,to,amount);}
}

contract ROtapContinuousLedger {
    uint256 private constant SCALE=10**27;
    address public immutable controller;
    uint256 public immutable startTime;uint256 public immutable HALVING_PERIOD;uint256 public immutable INITIAL_RATE;uint256 public immutable INITIAL_DAILY_EMISSION;
    ROtapContinuousReward public immutable token;
    uint256 public lastUpdate;uint256 public accVerif;uint256 public accUnver;
    uint256 public totalVerifWeight;uint256 public totalUnverWeight;
    uint256 public totalScheduled;uint256 public totalForgone;uint256 public totalDistributed;uint256 public totalClaimed;
    struct Position {address beneficiary;uint256 verified;uint256 unverified;uint256 debtVerified;uint256 debtUnverified;}
    mapping(bytes32=>Position) public positions;mapping(address=>uint256) public credit;
    event PositionUpdated(bytes32 indexed key,address indexed beneficiary,uint256 verified,uint256 unverified);
    event Claimed(address indexed beneficiary,uint256 amount);
    constructor(address controller_,uint256 genesis,uint256 period,uint256 initialDailyEmission){
        require(controller_!=address(0)&&period>0&&initialDailyEmission>0&&initialDailyEmission<=20_000_000*10**8,'CONFIG');controller=controller_;startTime=genesis;lastUpdate=genesis;HALVING_PERIOD=period;INITIAL_DAILY_EMISSION=initialDailyEmission;INITIAL_RATE=initialDailyEmission/86400;token=new ROtapContinuousReward();
    }
    function currentRate() external view returns(uint256){if(block.timestamp<startTime)return 0;uint256 era=(block.timestamp-startTime)/HALVING_PERIOD;return era>=256?0:(INITIAL_DAILY_EMISSION>>era)/86400;}
    function currentDailyEmission() external view returns(uint256){if(block.timestamp<startTime)return 0;uint256 era=(block.timestamp-startTime)/HALVING_PERIOD;return era>=256?0:INITIAL_DAILY_EMISSION>>era;}
    function pendingAtWeights(bytes32 key,uint256 verified,uint256 unverified) external view returns(uint256){
        uint256 av=accVerif;uint256 au=accUnver;uint256 amount=ROtapEmission.between(lastUpdate,block.timestamp,startTime,HALVING_PERIOD,INITIAL_DAILY_EMISSION);uint256 remaining=token.cap()-totalScheduled;if(amount>remaining)amount=remaining;uint256 u=amount/100;if(totalVerifWeight>0)av+=(amount-u)*SCALE/totalVerifWeight;if(totalUnverWeight>0)au+=u*SCALE/totalUnverWeight;Position storage p=positions[key];uint256 gross=verified*av/SCALE+unverified*au/SCALE;uint256 debt=p.debtVerified+p.debtUnverified;return gross>debt?gross-debt:0;
    }
    function poke() public {
        uint256 now_=block.timestamp;if(now_<=lastUpdate)return;
        uint256 amount=ROtapEmission.between(lastUpdate,now_,startTime,HALVING_PERIOD,INITIAL_DAILY_EMISSION);lastUpdate=now_;
        uint256 remaining=token.cap()-totalScheduled;if(amount>remaining)amount=remaining;totalScheduled+=amount;
        uint256 unverified=amount/100;uint256 verified=amount-unverified;
        if(totalVerifWeight==0)totalForgone+=verified;else{accVerif+=verified*SCALE/totalVerifWeight;totalDistributed+=verified;}
        if(totalUnverWeight==0)totalForgone+=unverified;else{accUnver+=unverified*SCALE/totalUnverWeight;totalDistributed+=unverified;}
    }
    function settle(bytes32 key) public {poke();settlePosition(positions[key]);}
    function settlePosition(Position storage position) private {
        uint256 verifiedGross=position.verified*accVerif/SCALE;uint256 unverifiedGross=position.unverified*accUnver/SCALE;
        if(position.beneficiary!=address(0))credit[position.beneficiary]+=verifiedGross-position.debtVerified+unverifiedGross-position.debtUnverified;
        position.debtVerified=verifiedGross;position.debtUnverified=unverifiedGross;
    }
    function setPosition(bytes32 key,address beneficiary,uint256 verified,uint256 unverified) external {
        require(msg.sender==controller&&beneficiary!=address(0),'AUTH');poke();Position storage position=positions[key];settlePosition(position);
        totalVerifWeight=totalVerifWeight-position.verified+verified;totalUnverWeight=totalUnverWeight-position.unverified+unverified;
        position.beneficiary=beneficiary;position.verified=verified;position.unverified=unverified;
        position.debtVerified=verified*accVerif/SCALE;position.debtUnverified=unverified*accUnver/SCALE;
        emit PositionUpdated(key,beneficiary,verified,unverified);
    }
    function reassign(bytes32 key,address beneficiary) external {
        require(msg.sender==controller&&beneficiary!=address(0),'AUTH');
        // Unclaimed position accrual follows its NFT. Do not checkpoint emission or debt here.
        positions[key].beneficiary=beneficiary;
    }
    function claim(bytes32[] calldata keys) external returns(uint256 amount){return claimFor(msg.sender,keys);}
    function claimFor(address beneficiary,bytes32[] calldata keys) public returns(uint256 amount){
        require(msg.sender==beneficiary||msg.sender==controller,'AUTH');
        poke();for(uint256 i;i<keys.length;i++)settlePosition(positions[keys[i]]);
        amount=credit[beneficiary];credit[beneficiary]=0;totalClaimed+=amount;
        require(totalClaimed<=totalDistributed,'ACCOUNTING');if(amount>0)require(token.transfer(beneficiary,amount),'TRANSFER');emit Claimed(beneficiary,amount);
    }
}

contract ROtapEmissionHarness {
    function between(uint256 from,uint256 until,uint256 genesis,uint256 period,uint256 initialDailyEmission) external pure returns(uint256){return ROtapEmission.between(from,until,genesis,period,initialDailyEmission);}
}

contract ROtapLedgerFactory {
    event LedgerCreated(address indexed controller,address indexed ledger,address token);
    function create(address controller,uint256 genesis,uint256 period,uint256 rate) external returns(address){require(controller==msg.sender,'CONTROLLER');ROtapContinuousLedger ledger=new ROtapContinuousLedger(controller,genesis,period,rate);emit LedgerCreated(controller,address(ledger),address(ledger.token()));return address(ledger);}
}
