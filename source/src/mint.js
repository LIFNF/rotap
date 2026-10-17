import {verifyLiveRelease} from './release-verification.js';
import {Contract, JsonRpcProvider, formatEther} from 'ethers';
import {verifyMintRecipients} from './payment-policy.js';
import pricing from '../config/mint-pricing.json';

export const saleAbi = [
  'function mint(uint256 id,uint256 amount) payable',
  'function mintPrice() view returns(uint256)',
  'function protocolFee() view returns(uint256)',
  'function supplyCap() view returns(uint256)',
  'function minted() view returns(uint256)',
  'function balanceOf(address,uint256) view returns(uint256)',
  'function creator() view returns(address)',
  'function protocolWallet() view returns(address)',
  'function quoteMint(address account,uint256 amount) view returns(uint256)',
];

export function mintView({address, account='', symbol='ETH'}) {
  return `<main id="main" class="container"><div class="page-head"><span class="eyebrow">TRANSISTOR MINT</span><h1>铸造晶体管</h1><p>铸造 NAND 与 LATCH，设计电路，流片上链。</p></div><div class="page-body"><div class="metrics"><div class="metric"><span class="stat-label">TOTAL SUPPLY / 总发行上限</span><strong id="mint-cap">1,000,000</strong></div><div class="metric"><span class="stat-label">MINTED / 累计铸造</span><strong id="mint-issued">—</strong></div><div class="metric"><span class="stat-label">REMAINING / 剩余供应</span><strong id="mint-remaining">—</strong></div></div><div class="inventory-grid"><article class="inventory-card"><h2>铸造晶体管</h2><div class="field"><label for="mint-kind">型号</label><select id="mint-kind"><option value="0">NAND（与非）</option><option value="1">LATCH（锁存器）</option></select></div><div class="field"><label for="mint-quantity">数量</label><input id="mint-quantity" type="number" min="1" step="1" value="1" max="1000000" inputmode="numeric"></div><div class="stat"><span>单价</span><span id="mint-unit">${address?"—":pricing.unitPriceETH+" ETH"}</span></div><div class="stat"><span>每笔协议费</span><span id="mint-fee">${address?"—":pricing.protocolFeeETH+" ETH"}</span></div><div class="stat"><span>本次支付</span><span id="mint-total">${address?"—":formatEther(BigInt(pricing.unitPriceWei)+BigInt(pricing.protocolFeeWei))} ${symbol}</span></div><button id="mint-submit" class="btn primary" disabled>${address?'读取合约…':'合约尚未部署'}</button><p id="mint-status" role="status" aria-live="polite">${address?'铸造参数以链上数据为准。':'发行价格已配置，合约尚未部署，当前不接受付款。'}</p></article><article class="inventory-card"><span class="tag">NAND / 00</span><h2>组合逻辑</h2><p>与非门用于构建组合逻辑电路。铸造电路时按实际使用量消耗。</p><span class="tag">LATCH / 01</span><h2>状态存储</h2><p>锁存器用于保存时序状态，与 NAND 共同组成可执行电路。</p><div class="row"><a class="btn" href="#materials">持有晶体管 ↗</a><a class="btn" href="#studio">设计电路 ↗</a></div></article></div><div class="notice" style="margin-top:24px">收款地址：<code>0x8638636536Ed50fC1cCCDFDa1790aCC83E39643A</code><br>发行上限为 1,000,000 枚。发行单价 ${pricing.unitPriceETH} ETH，每笔协议费 ${pricing.protocolFeeETH} ETH，另付网络 Gas 费。全部钱包适用相同价格与发行上限。开放后以链上合约读取结果为准。</div></div></main>`;
}

export async function bindMint({config, signer, report, account=''}) {
  if(!config.transistorsAddress) {
    const quantity=document.querySelector('#mint-quantity'),total=document.querySelector('#mint-total');
      const preview=()=>{total.textContent=/^[1-9]\d*$/.test(quantity.value)?formatEther(BigInt(pricing.unitPriceWei)*BigInt(quantity.value)+BigInt(pricing.protocolFeeWei))+' ETH':'请输入有效数量';};
    quantity.addEventListener('input',preview);preview();return;
  }
  const status=document.querySelector('#mint-status'),button=document.querySelector('#mint-submit');
  const quantity=document.querySelector('#mint-quantity'),kind=document.querySelector('#mint-kind');
  const reader=new JsonRpcProvider(config.rpcUrl,config.chainId);
  const contract=new Contract(config.transistorsAddress,saleAbi,reader);
  const total=document.querySelector('#mint-total'),capLabel=document.querySelector('#mint-cap'),issuedLabel=document.querySelector('#mint-issued'),remainingLabel=document.querySelector('#mint-remaining'),unitLabel=document.querySelector('#mint-unit'),feeLabel=document.querySelector('#mint-fee');
  let price=0n,fee=0n,remaining=0n,busy=false,verified=false,activeAccount=account;
  const update=()=>{
    const valid=/^[1-9]\d*$/.test(quantity.value),amount=valid?BigInt(quantity.value):0n;
    total.textContent=valid?formatEther(price*amount+fee)+' ETH':'请输入有效数量';
    button.disabled=!verified||busy||!valid||amount>remaining||remaining===0n;
    quantity.disabled=busy;kind.disabled=busy;
    button.textContent=remaining===0n?'供应已售罄':busy?'交易处理中…':'Mint 晶体管';
  };
  const refresh=async(who=activeAccount)=>{
    activeAccount=who;
    verified=false;button.disabled=true;
    const values=await Promise.all([contract.mintPrice(),contract.protocolFee(),contract.supplyCap(),contract.minted(),contract.creator(),contract.protocolWallet(),reader.getNetwork()]);
    const [,,cap,issued,creator,protocolWallet,network]=values;
    if(network.chainId!==BigInt(config.chainId))throw Error('铸造查询网络不一致');
    verifyMintRecipients(creator,protocolWallet);
    if(cap!==1000000n)throw Error('发行总量与指定的一百万枚不一致');
    [price,fee]=values;remaining=cap>issued?cap-issued:0n;
    capLabel.textContent=cap.toLocaleString('en-US');
    issuedLabel.textContent=issued.toLocaleString('en-US');
    remainingLabel.textContent=remaining.toLocaleString('en-US');
    unitLabel.textContent=formatEther(price)+' ETH';
    feeLabel.textContent=formatEther(fee)+' ETH';
    verified=true;
    update();
  };
  try{await verifyLiveRelease(config,reader);await refresh();status.textContent='收款地址已核验，请选择型号与数量。';}catch(error){status.textContent='铸造参数或收款地址核验失败，已停止铸造。';reader.destroy();report(error);return;}
  quantity.addEventListener('input',update);
  button.addEventListener('click',async()=>{
    busy=true;update();
    try{
      const wallet=await signer();await refresh(await wallet.getAddress());
      if(!button.isConnected)throw Error('页面已切换，请在当前页面重新提交');
      if((await wallet.provider.getNetwork()).chainId!==BigInt(config.chainId))throw Error('钱包网络不一致');
      if(!/^[1-9]\d*$/.test(quantity.value))throw Error('请输入正整数数量');
      const amount=BigInt(quantity.value);if(amount>remaining)throw Error('剩余供应不足');
      status.textContent='请在钱包中确认铸造交易。';
      const target=contract.connect(wallet),value=price*amount+fee,estimate=await target.mint.estimateGas(BigInt(kind.value),amount,{value});const tx=await target.mint(BigInt(kind.value),amount,{value,gasLimit:estimate*125n/100n+100000n});
      status.textContent='交易已提交，等待链上确认。';await tx.wait();
      await refresh();status.textContent='晶体管铸造完成。';
    }catch(error){status.textContent='铸造未完成。';report(error);}finally{busy=false;update();}
  });
}

