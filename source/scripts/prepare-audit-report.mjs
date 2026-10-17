import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {keccak256} from 'ethers';

// Publish every detector result. Context notes are project review notes, not an independent audit.
const rawBytes=fs.readFileSync('audit/slither-raw.json');
const raw=JSON.parse(rawBytes);
const manifest=JSON.parse(fs.readFileSync('candidate-v2/manifest.json'));
assert.equal(raw.success,true);
assert.deepEqual(raw.sourceHashes,manifest.sourceHashes,'Slither output must match the current compiler manifest');
for(const [name,hash] of Object.entries(raw.sourceHashes))assert.equal(keccak256(fs.readFileSync('contracts/'+name)),hash,'Slither report is stale: '+name);
const findings=raw.results.detectors;
const severityOrder=['High','Medium','Low','Informational','Optimization'];
const severityCounts=Object.fromEntries(severityOrder.map(level=>[level,findings.filter(item=>item.impact===level).length]));
const detectorCounts={};for(const item of findings)detectorCounts[item.check]=(detectorCounts[item.check]||0)+1;
const generatedAt=new Date().toISOString();
const environment=JSON.parse(execFileSync('python',['-c',"import importlib.metadata as m,sys,json;print(json.dumps({'python':sys.version.split()[0],'packages':{p:m.version(p) for p in ['slither-analyzer','crytic-compile','solc-select','web3','eth-abi','eth-utils']}}))"],{encoding:'utf8'}));
assert.equal(environment.packages['slither-analyzer'],raw.version,'Published scan environment must match the raw tool version');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const notes=new Map();
function note(id,title,description,resolution,evidence=[],status='项目已提供上下文，待独立复核'){
 const finding=findings.find(item=>item.id===id);assert(finding,'Missing raw finding '+id);
 notes.set(id,{id,title,severity:finding.impact,detector:finding.check,status,description,resolution,evidence});
}
note('8820989a75fdc768d014dca05a928b24af97a5ac282d231c9cfb01613c6446bd','NFT 市场 transferFrom 参数',
 'Slither 将 NFT 市场的 ERC-721 transferFrom 识别为 arbitrary-send-erc20。交易使用存储中的挂牌卖家和代币编号。',
 'ROtapCircuitMarket.buy 检查挂牌有效、预期价格、精确付款和当前 NFT 所有权；挂牌先验证卖方身份及授权，成交前取消挂牌状态。此处是 ERC-721 转移，未据此认定为可任意转走 ERC-20。仍需独立审查交易与回调组合。',
 ['contracts/ROtapMarkets.sol:62','contracts/ROtapMarkets.sol:65','scripts/test-markets.mjs','audit/markets-local.json']);
note('74dd11c4bc731ab28d3c36e16790946932e17a18e495481d228efc9705974b30','质押退出的收款人',
 'withdraw(address) 允许第三方触发已到期的退出，因此参数是外部提供的地址。',
 '金额只取自 unstaking[account]，支付给同一个 account；退出记录先删除，函数使用 nonReentrant。触发者不能把其他账户的本金改付给自己。七天队列、重复退出重置和本金守恒已有项目测试，尚未由独立审计方复核。',
 ['contracts/ROtapStakeBoost.sol:44','scripts/test-stake-boost.mjs','scripts/test-fixed-release-security.mjs','audit/fixed-release-security-local.json']);
note('8bee25fac96b7e437fb035960e20081776758fe10ec3e349a39f45fc4df9f6da','账户执行费用转款',
 '电路账户向 treasury 支付执行费用，被检测为任意 ETH 发送。',
 'treasury、EXEC_FEE、BATCH_FEE 均为构造时固定值。execute / executeBatch 先确认当前 NFT 持有人、付费开通状态及未挂牌状态，并使用 nonReentrant；多付部分仅退回调用者。费用收款权限公开记录，不属于被隐藏的提款权限。',
 ['contracts/ROtapAccounts.sol:39','contracts/ROtapAccounts.sol:47','contracts/ROtapAccounts.sol:50','audit/accounts-sites-local.json']);
note('a3d3b6412cc5e0b8c53d3fd82116bd278c4bac12ac97bb7689948b142ac33a16','开通账户费用转款',
 '账户开通合约向 treasury 转账，被检测为任意 ETH 发送。',
 '收款 treasury 与 FEE 为不可变值；只处理已注册处理器，按开通账户记录防止重复收费，多付部分退回调用者。open 在外部调用前设置 entered=1，并在结束时复位；失败整体回滚。仍需独立复核外部调用和锁的覆盖范围。',
 ['contracts/ROtapAccounts.sol:60','contracts/ROtapAccounts.sol:68','audit/accounts-sites-local.json']);
note('c91f21186414dcf91c10571b4e2e940c4f83e57fe00e2c9f8188ce175926c165','NFT 账户自主执行',
 'callTarget 可向调用者指定目标发送账户资产，这是 NFT 账户的执行功能。',
 'callTarget 为 private，只由经 authorize 检查并受 nonReentrant 保护的 execute / executeBatch 调用；当前 NFT 持有人可以执行，旧持有人及挂牌中的账户不能执行。用户自行调用恶意目标的风险仍由账户执行行为承担。',
 ['contracts/ROtapAccounts.sol:47','contracts/ROtapAccounts.sol:51','audit/accounts-sites-local.json']);
note('d2547f35cc1d179d8e12b1226da7cdde51ecfcb0a6d9ea93558b80b7959d6644','OpenZeppelin 非 payable 检查',
 '检测器指出依赖 ERC1967Utils._checkNonPayable 读取 msg.value 的可达路径问题。',
 '该项属于 OpenZeppelin 5.4.0 的代理实现依赖。未修改依赖代码，也未屏蔽告警；代理初始化、升级和最终封存路径需要与编译后的实际可达路径一起由独立审查方核对。',
 ['package-lock.json','scripts/test-fixed-release-security.mjs','scripts/test-processor-factory.mjs'],
 '上游依赖告警，待独立复核');
note('41c607c27972f86ec153b43f41955aac9ddc94d6bf7137e1b90ef5ab7160296b','ROTAP 质押的余额前后检查',
 'stakeRewardInternal 在 transferFrom 前记录余额，之后用余额差确认收到精确数量，检测器提示回调可能使前值失效。',
 '两个外部入口 stakeReward / stakeRewardWithKeys 均使用继承的 nonReentrant；生产 rewardToken 指向固定的 ROtapContinuousReward，该代币没有转账回调或手续费。精确余额差主动拒绝非标准到账数量。该判断依赖正确的生产部署绑定，不能推广到任意 ERC-20。',
 ['contracts/ROtapRewardStakeBoost.sol:26','contracts/ROtapRewardStakeBoost.sol:36','contracts/ROtapRewardStakeBoost.sol:38','contracts/ROtapContinuousLedger.sol:16','scripts/test-reward-stake.mjs']);
note('94b585786cd6effbd554a873b3f60289d7174fe994f0926102d27bbf6053617b','账户开通的重入告警',
 '检测器指出 open 外部调用之后仍写入 entered，给出 reentrancy-eth 告警。',
 '当前实现使用显式 entered 锁：外部调用前要求 entered==0 并设为 1，结束时改回 0。重入 open 会在首个检查失败；支付记录在 ETH 转款前设置，异常回滚。该项未被删除或标为独立审计通过，仍需复核所有交互路径。',
 ['contracts/ROtapAccounts.sol:68','scripts/test-accounts-sites.mjs','audit/accounts-sites-local.json']);
note('3e1331cd78d364d3391b4703516c50a4cb515c8c19f1534b49ba3a1f8e839c75','默认单钱包 Mint 上限',
 'walletCap 采用 Solidity 默认零值，未显式赋值。',
 '零值表示不设置额外的单钱包限额；所有钱包仍受共享的一百万个生命周期发行上限和精确付费检查约束。生产发行路径没有免费 Mint 白名单及改价、扩容入口；销毁不会减少 minted。保留本条原始告警供独立复核。',
 ['contracts/ROtapTransistors.sol:17','contracts/ROtapTransistors.sol:49','scripts/test-transistor-sale.mjs','audit/fixed-release-security-local.json']);
note('933e7b055033dcba8fb0286a86bb424570a4d3751d9f2a52ad392adaf1c4bc86','默认元件分类型上限',
 'typeCap 映射采用默认零值，未为 NAND / LATCH 分别赋值。',
 '零值表示无额外的分类型配额；NAND 和 LATCH 共用同一个 supplyCap，累计 minted 不因销毁而下降。默认值并非免费额度。生产参数与来源会在部署核验中再次检查。',
 ['contracts/ROtapTransistors.sol:18','contracts/ROtapTransistors.sol:49','scripts/test-transistor-sale.mjs']);
note('c054e8af557a5ca7e0b58a28e5c3998375d4d2b24a80d4aa5fb1567ed622dff1','反例集合的默认空值',
 'counterexamples 是按任务与处理器分组的动态集合，检测器提示未初始化。',
 '初始空数组是预期状态；registerCounterexample 校验后向对应数组加入反例，计数和检查函数读取该集合。此说明仅解释默认存储语义，反例覆盖充分性仍需独立审查。',
 ['contracts/ROtapMining.sol:41','contracts/ROtapMining.sol:93','contracts/ROtapMining.sol:144','scripts/test-mining-reference-governance.mjs']);
note('0c2187792c648a5af02613cb8270f9c10328016b4749c24acb5c9f2ceb1c2ec8','区块哈希抽样的残余风险',
 '样本索引由 anchorBlock 的 blockhash、处理器地址、NFT 编号和样本序号计算。区块哈希不是不可操纵的随机信标。矿工可选择是否使用一次抽样并重新 arm，区块生产者也可能影响锚点；重复索引会减少有效样本数。有限抽样可能漏掉错误电路。',
 '尚未消除，必须独立复核和评估经济攻击成本、重复尝试及抽样参数。当前另有任务 Merkle 证明、已登记反例检查和反例挑战/踢出流程；这些约束不能证明抽样无法被博弈，也不构成全向量正确性证明。',
 ['contracts/ROtapSamplingPolicy.sol:25','contracts/ROtapSamplingPolicy.sol:29','contracts/ROtapMining.sol:98','contracts/ROtapMining.sol:106','contracts/ROtapMining.sol:145'],
 '未解决的机制风险，待独立复核');
note('b889218fa6aa59724970aa96558835506e1a383e0d61410bece868b9a793a2ef','加成周期取余的随机数告警',
 'Slither 将 burnBpsNow 中 elapsed % period 标为 weak-prng。',
 '此表达式只计算当前周期内经过的时间，以判断销毁加成窗口；没有将结果用作抽样、抽奖或随机数。本条与区块哈希抽样告警分别记录，不能据此消除后者的实际风险。',
 ['contracts/ROtapBoost.sol:25','scripts/test-burn-boost.mjs'],
 '项目上下文：周期计算，待独立复核');
assert.equal(notes.size,severityCounts.High,'Every High raw finding must have a context note');
const highContext=[...notes.values()];
const protocolNotes=[
 {id:'fixed-mining-inventory',title:'两千万枚固定库存及挖矿释放',severity:'项目核对事项',status:'本地专项测试已完成，待独立复核',description:'代币构造时一次发行 20,000,000 ROTAP，八位小数，全部记入挖矿账本地址；部署者和普通钱包初始分配均为零。总发行量与已领取挖矿量必须分别展示。',resolution:'代币无后续 mint 函数；账本没有库存提款、approve 或管理员清扫入口，只有已记账的挖矿权益可通过 claim 转出。生产 controller 必须绑定最终封存的挖矿合约；本地 EOA 控制器测试仅是会计夹具。',evidence:['contracts/ROtapContinuousLedger.sol:16','scripts/test-mining-inventory.mjs','audit/mining-inventory-local.json']},
 {id:'daily-release-schedule',title:'每日 7,200 枚是初始排放预算',severity:'项目核对事项',status:'本地专项测试已完成，待独立复核',description:'初始每日排放预算为 7,200 ROTAP，99% 分配至验证池、1% 分配至未验证池，并按有效权重分配；每 126,000,000 秒减半。它不是每个矿工的产量，也不是收益保证。',resolution:'采用累计向下取整之差，避免检查点频率改变总排放；空池预算被放弃，不返还未来预算。被放弃份额和舍入余量可能永久留在账本内；累计排放预算封顶两千万枚，实际领取量可能低于总库存。',evidence:['contracts/ROtapContinuousLedger.sol:5','contracts/ROtapContinuousLedger.sol:49','scripts/test-mining-inventory.mjs']},
 {id:'automatic-mint-payment',title:'Mint ETH 自动进入部署者钱包',severity:'资金流说明',status:'本地资金流测试已完成，待独立复核',description:'Mint 成功交易中，ETH 由元件合约即时转给固定 creator / protocolWallet。生产参数将两者设为公开部署者地址 0x8638636536Ed50fC1cCCDFDa1790aCC83E39643A。此项没有另设 Mint 收入提款函数。',resolution:'收款失败会使整笔 Mint 回滚，防重入锁覆盖铸造、接收回调和转款。部署者获得 ETH 后的用途不受合约约束；未来手动添加流动性是运营计划，不能表述为已经建池或由合约强制执行。市场费用结算和用户质押退出仍是各自独立的资金流。',evidence:['contracts/ROtapTransistors.sol:49','scripts/test-transistor-sale.mjs','scripts/test-full-protocol-deployment.mjs']},
 {id:'no-live-pool',title:'流动性与退出条件',severity:'经济机制说明',status:'尚未建立交易池',description:'本版本不创建 ROTAP/ETH 池，也不提供协议赎回、保本或按固定价格兑换。质押退出只返还用户已经拥有并存入的相应资产。',resolution:'未来建池所需 ROTAP 必须先由正常挖矿释放后取得，不能提取账本中的未挖库存。市场交易退出依赖届时实际存在的池子、深度和交易对手；代币数量增长不代表投资回报。',evidence:['contracts/ROtapContinuousLedger.sol','contracts/ROtapRewardStakeBoost.sol']}
];
const review={schemaVersion:1,generatedAt,kind:'project-triage-of-automated-output',independentReview:false,tool:raw.tool,version:raw.version,detectorCount:raw.detectorCount,rawFindingCount:findings.length,severityCounts,detectorCounts,sourceHashes:raw.sourceHashes,rawReportSha256:sha256(rawBytes),dependencyLockSha256:sha256(fs.readFileSync('package-lock.json')),compiler:manifest.compiler,settings:manifest.settings,highContext,protocolNotes,findings:findings.map(item=>({id:item.id,detector:item.check,severity:item.impact,confidence:item.confidence,status:notes.get(item.id)?.status||'未逐项独立确认，保留原始输出',context:notes.get(item.id)||null,locations:item.elements.map(element=>({file:element.source_mapping.filename_relative,lines:element.source_mapping.lines})),description:item.description}))};
fs.mkdirSync('audit/public',{recursive:true});
review.environment=environment;
fs.writeFileSync('audit/public/slither.json',rawBytes);
fs.writeFileSync('audit/public/slither-environment.json',JSON.stringify(environment,null,2)+'\n');
fs.writeFileSync('audit/public/slither-review.json',JSON.stringify(review,null,2)+'\n');
const lines=['# ROtap 自动化合约检查记录','',`报告生成时间：${generatedAt}`,'','本记录由项目方根据 Slither 输出整理，不是独立人工审计，也不是审计通过证明。尚未完成独立人工代码及经济机制审查。所有原始告警完整保留，未使用忽略、排除或严重性降级规则。','',`Slither ${raw.version} 执行了 ${raw.detectorCount} 个检测器，产生 ${findings.length} 条原始告警。原始告警可能重复或误报，不等于已确认漏洞数量；也不能据此推断没有其他漏洞。`,'',...severityOrder.map(level=>`- ${level}：${severityCounts[level]} 条。`),'','## 原始资料','', '- [完整 Slither 原始 JSON](slither.json)','- [逐项索引、严重性统计与项目上下文](slither-review.json)','- [Slither 官方仓库](https://github.com/crytic/slither)',`- 原始报告 SHA-256：${review.rawReportSha256}`,`- 依赖锁文件 SHA-256：${review.dependencyLockSha256}`,'','原始 JSON 中的文件路径来自本地构建工作目录；保留原值用于核对工具输出。','', '## 范围与复现','',`编译器：${manifest.compiler}。优化器 runs=200，viaIR=true，EVM=paris。扫描包含下列 ${Object.keys(raw.sourceHashes).length} 份自有 Solidity 源文件及导入的 OpenZeppelin 5.4.0 依赖；不覆盖前端 JavaScript。依赖版本由 package-lock.json 锁定。`,'','1. 安装项目锁定的 Node 依赖，并执行 node scripts/compile-v2.mjs。','2. 执行 node scripts/prepare-slither.mjs，将相同 solc-js 编译输出整理为本地 Hardhat build-info。','3. 在 Python 环境安装 slither-analyzer==0.11.6。','4. 执行 python scripts/run-slither.py .test-chain/slither-project audit/slither-raw.json。','5. 执行 node scripts/prepare-audit-report.mjs，核对当前源码校验值并生成公开报告。','','适配脚本只替换本地构建产物的发现方式，避免远程编译器下载；检测器实现未修改，102 个检测器均执行。工具在本机运行，未向第三方审计服务上传代码。运行成功仅表示扫描完成。','','## 高严重性告警：项目上下文与待复核事项',''];
for(const item of highContext)lines.push(`### ${item.title}`,'',`- 检测器：${item.detector}；工具严重性：${item.severity}。`,`- 原始编号：${item.id}`,`- 状态：${item.status}。`,'',item.description,'',item.resolution,'',`核对资料：${item.evidence.join('；')}。`,'');
lines.push('## 资金及代币专项核对','');for(const item of protocolNotes)lines.push(`### ${item.title}`,'',`状态：${item.status}。`,'',item.description,'',item.resolution,'',`核对资料：${item.evidence.join('；')}。`,'');
lines.push('## 其余告警与限制','','其余 214 条 Medium / Low / Informational / Optimization 原始告警均保留在下载文件中，尚未逐项由独立人员确认或排除。它们包括重入路径、循环外部调用、时间戳依赖、取整顺序、局部变量默认值、未使用返回值、汇编及代码维护问题。项目测试不能代替逐条安全审查。','','区块哈希抽样为明确尚未消除的机制风险。任务证明、反例和踢出流程不能将有限抽样变成穷尽正确性证明；不应将本报告用于宣称该机制不可操纵。','','本报告未验证任何主网部署；实际部署地址、链 ID、权限封存、运行时代码和浏览器源码验证必须另行核对。合约未部署或核验失败时网站应继续禁止付款。报告不包含私钥管理、托管平台、运营钱包、流动性池、代币价格或经济可持续性的保证。','','项目本地测试是实现方证据。源码或部署参数发生变化后，须重新扫描和执行相应测试。本报告没有替代部署门槛中要求的独立审查。','','## 源文件校验值','','以下为 UTF-8 文件原始字节的 Keccak-256，与编译产物清单及原始 Slither 输出一致：','',...Object.entries(raw.sourceHashes).map(([name,hash])=>`- contracts/${name}：${hash}`),'','## 全部原始告警索引','');
for(const item of findings){const first=item.elements[0]?.source_mapping;lines.push(`- ${item.impact} / ${item.check} / ${item.id}；${first?.filename_relative||'未知文件'}:${first?.lines?.[0]||'?'}；${notes.get(item.id)?.status||'未逐项独立确认，见完整原始输出'}。`);}
lines.splice(lines.indexOf('## 高严重性告警：项目上下文与待复核事项'),0,
 'Python 执行环境：'+environment.python+'；'+Object.entries(environment.packages).map(([name,version])=>name+'=='+version).join('；')+'。',
 '',
 '可在隔离 Python 环境中按以上确切版本安装。环境版本见 [slither-environment.json](slither-environment.json)。本地 AST 适配不调用 solc-select 下载原生编译器。',
 '');
fs.writeFileSync('audit/public/slither-report.md',lines.join('\n')+'\n');
let previous={};try{previous=JSON.parse(fs.readFileSync('audit/audit-summary.json'));}catch{}
const summary={schemaVersion:1,generatedAt,status:'completed',kind:'automated',independentReview:false,scope:[`${Object.keys(raw.sourceHashes).length} 份自有 Solidity 源文件与导入依赖；编译器 ${manifest.compiler}。`,'Slither 全部 102 个检测器；完整原始输出，不排除或压低严重性。','项目人工上下文仅覆盖 13 条 High 告警及资金/库存规则；其余 214 条原始告警仍待独立逐项确认。'],tools:[{name:'Slither',version:raw.version,status:'completed',report:'reports/slither.json',officialUrl:'https://github.com/crytic/slither',summary:`执行 ${raw.detectorCount} 个检测器，产生 ${findings.length} 条原始告警：High 13、Medium 51、Low 71、Informational 90、Optimization 2。`,readableReport:'reports/slither-report.md',triageReport:'reports/slither-review.json'},...(previous.tools||[]).filter(item=>item.name!=='Slither')],sourceHashes:raw.sourceHashes,rawFindingCount:findings.length,severityCounts,limitations:['扫描完成不代表安全审计通过；尚未完成独立人工合约与经济机制审查。','区块哈希抽样存在重新尝试、样本重复及区块生产者影响风险，尚未消除。','214 条非 High 原始告警尚未逐项独立确认或排除。','报告仅对应列出的源码校验值，不自动覆盖其他版本或主网部署。','尚未建立 ROTAP/ETH 池；未来手动添加流动性不受 Mint 合约强制执行，市场退出依赖实际流动性。'],findings:[...highContext,...protocolNotes]};
if(previous.sourceCommit&&JSON.stringify(previous.sourceHashes)===JSON.stringify(summary.sourceHashes))summary.sourceCommit=previous.sourceCommit;
fs.writeFileSync('audit/audit-summary.json',JSON.stringify(summary,null,2)+'\n');
assert.equal(fs.readFileSync('audit/public/slither.json').equals(rawBytes),true);
console.log(`Published complete Slither output: ${findings.length} findings; ${highContext.length} High findings have project context; independent review pending.`);
