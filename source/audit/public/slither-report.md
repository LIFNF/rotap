# ROtap 自动化合约检查记录

报告生成时间：2026-10-17T07:57:53.216Z

本记录由项目方根据 Slither 输出整理，不是独立人工审计，也不是审计通过证明。尚未完成独立人工代码及经济机制审查。所有原始告警完整保留，未使用忽略、排除或严重性降级规则。

Slither 0.11.6 执行了 102 个检测器，产生 227 条原始告警。原始告警可能重复或误报，不等于已确认漏洞数量；也不能据此推断没有其他漏洞。

- High：13 条。
- Medium：51 条。
- Low：71 条。
- Informational：90 条。
- Optimization：2 条。

## 原始资料

- [完整 Slither 原始 JSON](slither.json)
- [逐项索引、严重性统计与项目上下文](slither-review.json)
- [Slither 官方仓库](https://github.com/crytic/slither)
- 原始报告 SHA-256：476ab7e508a054d78575ff5814f920d417fa7314ff83693c7b989ccfad80863e
- 依赖锁文件 SHA-256：110dd02fccaf6e154924ad117a0dcfea6cbea78e57b035cfb97e3221154e014e

原始 JSON 中的文件路径来自本地构建工作目录；保留原值用于核对工具输出。

## 范围与复现

编译器：0.8.30+commit.73712a01.Emscripten.clang。优化器 runs=200，viaIR=true，EVM=paris。扫描包含下列 14 份自有 Solidity 源文件及导入的 OpenZeppelin 5.4.0 依赖；不覆盖前端 JavaScript。依赖版本由 package-lock.json 锁定。

1. 安装项目锁定的 Node 依赖，并执行 node scripts/compile-v2.mjs。
2. 执行 node scripts/prepare-slither.mjs，将相同 solc-js 编译输出整理为本地 Hardhat build-info。
3. 在 Python 环境安装 slither-analyzer==0.11.6。
4. 执行 python scripts/run-slither.py .test-chain/slither-project audit/slither-raw.json。
5. 执行 node scripts/prepare-audit-report.mjs，核对当前源码校验值并生成公开报告。

适配脚本只替换本地构建产物的发现方式，避免远程编译器下载；检测器实现未修改，102 个检测器均执行。工具在本机运行，未向第三方审计服务上传代码。运行成功仅表示扫描完成。

Python 执行环境：3.12.10；slither-analyzer==0.11.6；crytic-compile==0.4.2；solc-select==1.2.0；web3==7.16.0；eth-abi==6.0.0；eth-utils==6.0.0。

可在隔离 Python 环境中按以上确切版本安装。环境版本见 [slither-environment.json](slither-environment.json)。本地 AST 适配不调用 solc-select 下载原生编译器。

## 高严重性告警：项目上下文与待复核事项

### NFT 市场 transferFrom 参数

- 检测器：arbitrary-send-erc20；工具严重性：High。
- 原始编号：8820989a75fdc768d014dca05a928b24af97a5ac282d231c9cfb01613c6446bd
- 状态：项目已提供上下文，待独立复核。

Slither 将 NFT 市场的 ERC-721 transferFrom 识别为 arbitrary-send-erc20。交易使用存储中的挂牌卖家和代币编号。

ROtapCircuitMarket.buy 检查挂牌有效、预期价格、精确付款和当前 NFT 所有权；挂牌先验证卖方身份及授权，成交前取消挂牌状态。此处是 ERC-721 转移，未据此认定为可任意转走 ERC-20。仍需独立审查交易与回调组合。

核对资料：contracts/ROtapMarkets.sol:62；contracts/ROtapMarkets.sol:65；scripts/test-markets.mjs；audit/markets-local.json。

### 质押退出的收款人

- 检测器：arbitrary-send-eth；工具严重性：High。
- 原始编号：74dd11c4bc731ab28d3c36e16790946932e17a18e495481d228efc9705974b30
- 状态：项目已提供上下文，待独立复核。

withdraw(address) 允许第三方触发已到期的退出，因此参数是外部提供的地址。

金额只取自 unstaking[account]，支付给同一个 account；退出记录先删除，函数使用 nonReentrant。触发者不能把其他账户的本金改付给自己。七天队列、重复退出重置和本金守恒已有项目测试，尚未由独立审计方复核。

核对资料：contracts/ROtapStakeBoost.sol:44；scripts/test-stake-boost.mjs；scripts/test-fixed-release-security.mjs；audit/fixed-release-security-local.json。

### 账户执行费用转款

- 检测器：arbitrary-send-eth；工具严重性：High。
- 原始编号：8bee25fac96b7e437fb035960e20081776758fe10ec3e349a39f45fc4df9f6da
- 状态：项目已提供上下文，待独立复核。

电路账户向 treasury 支付执行费用，被检测为任意 ETH 发送。

treasury、EXEC_FEE、BATCH_FEE 均为构造时固定值。execute / executeBatch 先确认当前 NFT 持有人、付费开通状态及未挂牌状态，并使用 nonReentrant；多付部分仅退回调用者。费用收款权限公开记录，不属于被隐藏的提款权限。

核对资料：contracts/ROtapAccounts.sol:39；contracts/ROtapAccounts.sol:47；contracts/ROtapAccounts.sol:50；audit/accounts-sites-local.json。

### 开通账户费用转款

- 检测器：arbitrary-send-eth；工具严重性：High。
- 原始编号：a3d3b6412cc5e0b8c53d3fd82116bd278c4bac12ac97bb7689948b142ac33a16
- 状态：项目已提供上下文，待独立复核。

账户开通合约向 treasury 转账，被检测为任意 ETH 发送。

收款 treasury 与 FEE 为不可变值；只处理已注册处理器，按开通账户记录防止重复收费，多付部分退回调用者。open 在外部调用前设置 entered=1，并在结束时复位；失败整体回滚。仍需独立复核外部调用和锁的覆盖范围。

核对资料：contracts/ROtapAccounts.sol:60；contracts/ROtapAccounts.sol:68；audit/accounts-sites-local.json。

### NFT 账户自主执行

- 检测器：arbitrary-send-eth；工具严重性：High。
- 原始编号：c91f21186414dcf91c10571b4e2e940c4f83e57fe00e2c9f8188ce175926c165
- 状态：项目已提供上下文，待独立复核。

callTarget 可向调用者指定目标发送账户资产，这是 NFT 账户的执行功能。

callTarget 为 private，只由经 authorize 检查并受 nonReentrant 保护的 execute / executeBatch 调用；当前 NFT 持有人可以执行，旧持有人及挂牌中的账户不能执行。用户自行调用恶意目标的风险仍由账户执行行为承担。

核对资料：contracts/ROtapAccounts.sol:47；contracts/ROtapAccounts.sol:51；audit/accounts-sites-local.json。

### OpenZeppelin 非 payable 检查

- 检测器：msg-value-in-nonpayable；工具严重性：High。
- 原始编号：d2547f35cc1d179d8e12b1226da7cdde51ecfcb0a6d9ea93558b80b7959d6644
- 状态：上游依赖告警，待独立复核。

检测器指出依赖 ERC1967Utils._checkNonPayable 读取 msg.value 的可达路径问题。

该项属于 OpenZeppelin 5.4.0 的代理实现依赖。未修改依赖代码，也未屏蔽告警；代理初始化、升级和最终封存路径需要与编译后的实际可达路径一起由独立审查方核对。

核对资料：package-lock.json；scripts/test-fixed-release-security.mjs；scripts/test-processor-factory.mjs。

### ROTAP 质押的余额前后检查

- 检测器：reentrancy-balance；工具严重性：High。
- 原始编号：41c607c27972f86ec153b43f41955aac9ddc94d6bf7137e1b90ef5ab7160296b
- 状态：项目已提供上下文，待独立复核。

stakeRewardInternal 在 transferFrom 前记录余额，之后用余额差确认收到精确数量，检测器提示回调可能使前值失效。

两个外部入口 stakeReward / stakeRewardWithKeys 均使用继承的 nonReentrant；生产 rewardToken 指向固定的 ROtapContinuousReward，该代币没有转账回调或手续费。精确余额差主动拒绝非标准到账数量。该判断依赖正确的生产部署绑定，不能推广到任意 ERC-20。

核对资料：contracts/ROtapRewardStakeBoost.sol:26；contracts/ROtapRewardStakeBoost.sol:36；contracts/ROtapRewardStakeBoost.sol:38；contracts/ROtapContinuousLedger.sol:16；scripts/test-reward-stake.mjs。

### 账户开通的重入告警

- 检测器：reentrancy-eth；工具严重性：High。
- 原始编号：94b585786cd6effbd554a873b3f60289d7174fe994f0926102d27bbf6053617b
- 状态：项目已提供上下文，待独立复核。

检测器指出 open 外部调用之后仍写入 entered，给出 reentrancy-eth 告警。

当前实现使用显式 entered 锁：外部调用前要求 entered==0 并设为 1，结束时改回 0。重入 open 会在首个检查失败；支付记录在 ETH 转款前设置，异常回滚。该项未被删除或标为独立审计通过，仍需复核所有交互路径。

核对资料：contracts/ROtapAccounts.sol:68；scripts/test-accounts-sites.mjs；audit/accounts-sites-local.json。

### 默认单钱包 Mint 上限

- 检测器：uninitialized-state；工具严重性：High。
- 原始编号：3e1331cd78d364d3391b4703516c50a4cb515c8c19f1534b49ba3a1f8e839c75
- 状态：项目已提供上下文，待独立复核。

walletCap 采用 Solidity 默认零值，未显式赋值。

零值表示不设置额外的单钱包限额；所有钱包仍受共享的一百万个生命周期发行上限和精确付费检查约束。生产发行路径没有免费 Mint 白名单及改价、扩容入口；销毁不会减少 minted。保留本条原始告警供独立复核。

核对资料：contracts/ROtapTransistors.sol:17；contracts/ROtapTransistors.sol:49；scripts/test-transistor-sale.mjs；audit/fixed-release-security-local.json。

### 默认元件分类型上限

- 检测器：uninitialized-state；工具严重性：High。
- 原始编号：933e7b055033dcba8fb0286a86bb424570a4d3751d9f2a52ad392adaf1c4bc86
- 状态：项目已提供上下文，待独立复核。

typeCap 映射采用默认零值，未为 NAND / LATCH 分别赋值。

零值表示无额外的分类型配额；NAND 和 LATCH 共用同一个 supplyCap，累计 minted 不因销毁而下降。默认值并非免费额度。生产参数与来源会在部署核验中再次检查。

核对资料：contracts/ROtapTransistors.sol:18；contracts/ROtapTransistors.sol:49；scripts/test-transistor-sale.mjs。

### 反例集合的默认空值

- 检测器：uninitialized-state；工具严重性：High。
- 原始编号：c054e8af557a5ca7e0b58a28e5c3998375d4d2b24a80d4aa5fb1567ed622dff1
- 状态：项目已提供上下文，待独立复核。

counterexamples 是按任务与处理器分组的动态集合，检测器提示未初始化。

初始空数组是预期状态；registerCounterexample 校验后向对应数组加入反例，计数和检查函数读取该集合。此说明仅解释默认存储语义，反例覆盖充分性仍需独立审查。

核对资料：contracts/ROtapMining.sol:41；contracts/ROtapMining.sol:93；contracts/ROtapMining.sol:144；scripts/test-mining-reference-governance.mjs。

### 区块哈希抽样的残余风险

- 检测器：weak-prng；工具严重性：High。
- 原始编号：0c2187792c648a5af02613cb8270f9c10328016b4749c24acb5c9f2ceb1c2ec8
- 状态：未解决的机制风险，待独立复核。

样本索引由 anchorBlock 的 blockhash、处理器地址、NFT 编号和样本序号计算。区块哈希不是不可操纵的随机信标。矿工可选择是否使用一次抽样并重新 arm，区块生产者也可能影响锚点；重复索引会减少有效样本数。有限抽样可能漏掉错误电路。

尚未消除，必须独立复核和评估经济攻击成本、重复尝试及抽样参数。当前另有任务 Merkle 证明、已登记反例检查和反例挑战/踢出流程；这些约束不能证明抽样无法被博弈，也不构成全向量正确性证明。

核对资料：contracts/ROtapSamplingPolicy.sol:25；contracts/ROtapSamplingPolicy.sol:29；contracts/ROtapMining.sol:98；contracts/ROtapMining.sol:106；contracts/ROtapMining.sol:145。

### 加成周期取余的随机数告警

- 检测器：weak-prng；工具严重性：High。
- 原始编号：b889218fa6aa59724970aa96558835506e1a383e0d61410bece868b9a793a2ef
- 状态：项目上下文：周期计算，待独立复核。

Slither 将 burnBpsNow 中 elapsed % period 标为 weak-prng。

此表达式只计算当前周期内经过的时间，以判断销毁加成窗口；没有将结果用作抽样、抽奖或随机数。本条与区块哈希抽样告警分别记录，不能据此消除后者的实际风险。

核对资料：contracts/ROtapBoost.sol:25；scripts/test-burn-boost.mjs。

## 资金及代币专项核对

### 两千万枚固定库存及挖矿释放

状态：本地专项测试已完成，待独立复核。

代币构造时一次发行 20,000,000 ROTAP，八位小数，全部记入挖矿账本地址；部署者和普通钱包初始分配均为零。总发行量与已领取挖矿量必须分别展示。

代币无后续 mint 函数；账本没有库存提款、approve 或管理员清扫入口，只有已记账的挖矿权益可通过 claim 转出。生产 controller 必须绑定最终封存的挖矿合约；本地 EOA 控制器测试仅是会计夹具。

核对资料：contracts/ROtapContinuousLedger.sol:16；scripts/test-mining-inventory.mjs；audit/mining-inventory-local.json。

### 每日 7,200 枚是初始排放预算

状态：本地专项测试已完成，待独立复核。

初始每日排放预算为 7,200 ROTAP，99% 分配至验证池、1% 分配至未验证池，并按有效权重分配；每 126,000,000 秒减半。它不是每个矿工的产量，也不是收益保证。

采用累计向下取整之差，避免检查点频率改变总排放；空池预算被放弃，不返还未来预算。被放弃份额和舍入余量可能永久留在账本内；累计排放预算封顶两千万枚，实际领取量可能低于总库存。

核对资料：contracts/ROtapContinuousLedger.sol:5；contracts/ROtapContinuousLedger.sol:49；scripts/test-mining-inventory.mjs。

### Mint ETH 自动进入部署者钱包

状态：本地资金流测试已完成，待独立复核。

Mint 成功交易中，ETH 由元件合约即时转给固定 creator / protocolWallet。生产参数将两者设为公开部署者地址 0x8638636536Ed50fC1cCCDFDa1790aCC83E39643A。此项没有另设 Mint 收入提款函数。

收款失败会使整笔 Mint 回滚，防重入锁覆盖铸造、接收回调和转款。部署者获得 ETH 后的用途不受合约约束；未来手动添加流动性是运营计划，不能表述为已经建池或由合约强制执行。市场费用结算和用户质押退出仍是各自独立的资金流。

核对资料：contracts/ROtapTransistors.sol:49；scripts/test-transistor-sale.mjs；scripts/test-full-protocol-deployment.mjs。

### 流动性与退出条件

状态：尚未建立交易池。

本版本不创建 ROTAP/ETH 池，也不提供协议赎回、保本或按固定价格兑换。质押退出只返还用户已经拥有并存入的相应资产。

未来建池所需 ROTAP 必须先由正常挖矿释放后取得，不能提取账本中的未挖库存。市场交易退出依赖届时实际存在的池子、深度和交易对手；代币数量增长不代表投资回报。

核对资料：contracts/ROtapContinuousLedger.sol；contracts/ROtapRewardStakeBoost.sol。

## 其余告警与限制

其余 214 条 Medium / Low / Informational / Optimization 原始告警均保留在下载文件中，尚未逐项由独立人员确认或排除。它们包括重入路径、循环外部调用、时间戳依赖、取整顺序、局部变量默认值、未使用返回值、汇编及代码维护问题。项目测试不能代替逐条安全审查。

区块哈希抽样为明确尚未消除的机制风险。任务证明、反例和踢出流程不能将有限抽样变成穷尽正确性证明；不应将本报告用于宣称该机制不可操纵。

本报告未验证任何主网部署；实际部署地址、链 ID、权限封存、运行时代码和浏览器源码验证必须另行核对。合约未部署或核验失败时网站应继续禁止付款。报告不包含私钥管理、托管平台、运营钱包、流动性池、代币价格或经济可持续性的保证。

项目本地测试是实现方证据。源码或部署参数发生变化后，须重新扫描和执行相应测试。本报告没有替代部署门槛中要求的独立审查。

## 源文件校验值

以下为 UTF-8 文件原始字节的 Keccak-256，与编译产物清单及原始 Slither 输出一致：

- contracts/ROtapRuntime.sol：0xab661fce6aa7d77d7358a9ae1d1e0bc743fed4154897a03e0c2c1bb9dab974cc
- contracts/ROtapTransistors.sol：0x35781194816b12474626d89eacf7c32df5ea567f6845f3417bb589f46b047b82
- contracts/ROtapCircuits.sol：0xda9401231c3e02c718ed60e424b90a4804babe845f10f38172cc24257cba603f
- contracts/ROtapReferenceRuntime.sol：0xfa0ad6b026c86a2ccd387ff4e560e0cfe31d43795e4f1abc7000749972dd701e
- contracts/ROtapContinuousLedger.sol：0xdafc1aeddb426492f96acc09b57dc6cc40b690d2313e0c53471e9fcf3124d34f
- contracts/ROtapStakeBoost.sol：0x4af38aa3c1761fb4986c231377990a404c53497ea284e93eb64f315973989f52
- contracts/ROtapRewardStakeBoost.sol：0x5604967a5fe4efe9edfcfe38d220601899a79dd368aacf960989ed6c5ac23dcf
- contracts/ROtapBoost.sol：0xbd8ea00471cd94c662455618d1b10954b8d6bc7a4f6eb80b2280dc49565ab92c
- contracts/ROtapSamplingPolicy.sol：0x494e9307690eb9e78325f4bd2b9f1fd3bf26495d246d0d1e921cf403ab0e6129
- contracts/ROtapTaskRegistry.sol：0xae1f3b80b4cda27dd94dbbfb68ed9c78f161f3900d6935551b4b45baf302a372
- contracts/ROtapMining.sol：0xac1eea7891e88f204e9105d18d41434a5debd767505374e659551a9b72497e02
- contracts/ROtapMarkets.sol：0x4057e92b7501f4420ecc38395fb5e069bded10fbec39b9d23e547c26f22770ac
- contracts/ROtapAccounts.sol：0xeb645ced5cb2acff84dbac10137d1cca63c156e667b4f8b6ec52152d52616f40
- contracts/ROtapProcessorFactory.sol：0x4b9afb04796f3ffeab3e88652890e0904dba96d6a5744cc9c4f636c06ad40bca

## 全部原始告警索引

- High / arbitrary-send-erc20 / 8820989a75fdc768d014dca05a928b24af97a5ac282d231c9cfb01613c6446bd；ROtapMarkets.sol:65；项目已提供上下文，待独立复核。
- High / arbitrary-send-eth / 74dd11c4bc731ab28d3c36e16790946932e17a18e495481d228efc9705974b30；ROtapStakeBoost.sol:44；项目已提供上下文，待独立复核。
- High / arbitrary-send-eth / 8bee25fac96b7e437fb035960e20081776758fe10ec3e349a39f45fc4df9f6da；ROtapAccounts.sol:50；项目已提供上下文，待独立复核。
- High / arbitrary-send-eth / a3d3b6412cc5e0b8c53d3fd82116bd278c4bac12ac97bb7689948b142ac33a16；ROtapAccounts.sol:68；项目已提供上下文，待独立复核。
- High / arbitrary-send-eth / c91f21186414dcf91c10571b4e2e940c4f83e57fe00e2c9f8188ce175926c165；ROtapAccounts.sol:51；项目已提供上下文，待独立复核。
- Informational / assembly / 039109c33079cb1c38d82b0adf785f2213d34ab8424cdf674b25c110b85d2fd3；@openzeppelin/contracts/utils/StorageSlot.sol:138；未逐项独立确认，见完整原始输出。
- Informational / assembly / 0c6284f8208c63a3b9464d84036053d6e52a543d6f4d264754af3ddbaeb95a3a；ROtapAccounts.sol:43；未逐项独立确认，见完整原始输出。
- Informational / assembly / 12c5b6636cbfad04a396516577f175829714628ac43f5335e079ab05d8867c5c；@openzeppelin/contracts/utils/StorageSlot.sol:75；未逐项独立确认，见完整原始输出。
- Informational / assembly / 222a14038a97612d4cface4df4a3eddc8b4dbb6428943c162ec15bd325e54b53；ROtapAccounts.sol:51；未逐项独立确认，见完整原始输出。
- Informational / assembly / 22f812fb8fb733143a5aad6d617d8ccd1f00d4172891967fbc989421476443d3；@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol:232；未逐项独立确认，见完整原始输出。
- Informational / assembly / 2abc08b6db02eaddb5a47aa9d5647be9c1e56430baa8a2a8aaa989ed648efeb5；@openzeppelin/contracts/utils/StorageSlot.sol:66；未逐项独立确认，见完整原始输出。
- Informational / assembly / 2bc726882ee59681ab98b898079162fbee3088141bc95378a1b7c747de7e829f；@openzeppelin/contracts/utils/StorageSlot.sol:120；未逐项独立确认，见完整原始输出。
- Informational / assembly / 4c71a5a65604e0889d97ddddb2e896f12107d0d59c17d15ae30133e14fc26117；@openzeppelin/contracts/utils/StorageSlot.sol:93；未逐项独立确认，见完整原始输出。
- Informational / assembly / 63d519920cb3c30728931f14deaa434d33a289dada1d31ed5483e93a73eaf64e；@openzeppelin/contracts/utils/StorageSlot.sol:102；未逐项独立确认，见完整原始输出。
- Informational / assembly / 6c1b2307f0c3b02ce04e7bf87cad5647ce4d602e0510a9e6e4648b6c45e7b886；@openzeppelin/contracts/utils/StorageSlot.sol:111；未逐项独立确认，见完整原始输出。
- Informational / assembly / 6c1eb0884da031dd093f80bc08a7519983ecc3b4c024197f4f60f57d1556ef6d；@openzeppelin/contracts/utils/StorageSlot.sol:84；未逐项独立确认，见完整原始输出。
- Informational / assembly / 6d0370a2b7e7500399f0609f2a49dae40427c0c7c8a55f25c58a59188021781b；@openzeppelin/contracts/utils/StorageSlot.sol:129；未逐项独立确认，见完整原始输出。
- Informational / assembly / 83199df05ab835cde3693804260d7739cfae73f5901d1060d81e47a762e90848；ROtapAccounts.sol:16；未逐项独立确认，见完整原始输出。
- Informational / assembly / 8872ab00b82e949ed9adcdac28fd3ba87034b397f91f6e609882c0f38a0ab75b；ROtapAccounts.sol:31；未逐项独立确认，见完整原始输出。
- Informational / assembly / 8bb500884477cd319535fdedfd4287f90117c475a512df2f43a4be12e3bfe143；@openzeppelin/contracts/proxy/Proxy.sol:22；未逐项独立确认，见完整原始输出。
- Informational / assembly / a726b177c772370d70a15cc48c4e758e6e083875011e4c15a78b405abf5fd237；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:27；未逐项独立确认，见完整原始输出。
- Informational / assembly / c2759cedf3231427e140c948718133f49c4e69b5952f5c3fdbfb529213f9294f；ROtapTransistors.sol:89；未逐项独立确认，见完整原始输出。
- Informational / assembly / d43ac87609aebe2cf70667df23e8d2f98511dfb1d4908e50fd6cc844cc72c1f4；@openzeppelin/contracts/utils/Address.sol:138；未逐项独立确认，见完整原始输出。
- Informational / assembly / d5d1f25f0b623a45f9b22844857c4fccde44bd7cda47517b8e9b4b69c5a1e845；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:30；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 09d79d81cbe33cb0e7b8acf2f0f60a2a709c5effc918d48bd6eff57058ec7d18；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 119deba67bd00a7a251e5ae0c2b0a9514f7b9e2cad1940b1f69fa6f0ef780815；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 12e0868c3160585ebbec02a86e9274f464a4562738087df1c5e3e16566b563a9；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 172e81615cf9a16d2ee1e23bc4879cc6d241d027e9d0fca0d7ad4ad90859a3ca；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 1802807ea294d0aac2d5fea85642bbc4455cdbd7c76953b988cf4a12f4f900c4；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 1f37c267513279f8db6b279cf29f006b80442fefeb309ce48249e95f1821a845；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 1f6e99c75f4244828b16d53f2486f702f5aa93048371aa63efe1d887715b851f；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 2db4b2340e0679e12095444effe9fffdf45fbd1dd0f64f2f07ef62a468f970e3；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 3203092281df1fd678f79c3d3ccc488ea5fd17cdb415c2244afde371ea1adec3；ROtapAccounts.sol:51；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 3451f289a364296ba7fbce9f35bab2a748ce3969f7f24ffdac7a96b6eb405f22；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 38d30cab5f1b1450c7aeba5693730343920b79d2dad3cb94066d90460d533a7b；ROtapMining.sol:144；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 3ba99babe1b1bc03e571bd18259e019214337e612522a10fc5898361bd78a515；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 420c529d08841fed0c2386439384d2a77c258c2418211b9f7318cc7f61d17d82；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 4915f318436ac8764f60e4a0617bb4581de264fc861932431a9d29bbbe2ae1e5；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 4ac2b349f3ae8b9e222d5fef365135bed125dd5013075f865b12ee5ba0f4a9f9；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 50e3d001fcffa5ce461f3dd45e6b3c0fd478631ab900f5db6c1bb8a2cdae189f；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 632310f4de6e485f22f005eebffffcee55197e605a25e3b84441d19dd6ad552b；ROtapMining.sol:144；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 649bce8d1e3cb33e07435f7ef843eee7d4d2aa8b6255370e9cfaeea99c8c6f54；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 6a37b02f25e972421b9d848dee87d32824e137e7fd0f9d933fbcff575183d86c；ROtapMining.sol:144；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 87ab560f1542aa59059311ec953768e32f560025f4992031b0e2d2ed05db03bc；ROtapMining.sol:144；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 8b62b2e7080e0b73dc90bb8e8b4f059106d5483e2e224d07012d7b121afeeb7d；ROtapMining.sol:99；未逐项独立确认，见完整原始输出。
- Low / calls-loop / 8ecd8697c54116994a358ba9eed9c8e2c4dd387e259a6b41bb88ed0b3aee8b38；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / a8c670a2631ca953b857eb357f96330ef8d5ca1f21dfd12c49eb116832410906；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / aa0eb25d31d21dfae22c91e1644e2985788d303ac9c763ad4ae71f867024eab3；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / ab9a8a6bf02691b7319287edb62f6671f061594f61566717dda4203824f78e55；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / ad22407d20b6fe901681779963865f5c261e7d57ce7cefa87f27caeabac35638；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / b158391cd7a7ac91fead00b526f59fa13c26735e2fa1cdffff9cc9160c1aafd1；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / b801fe7e3431b2b344944fb5fa627558ff30033147f492817250e23883cf9886；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / b862679e9f3c949d8794cdae9744b4f4b59dd6f82de9c575f2922629f26e8a1e；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / ba213f826597fdc44aa4d2a1673061ec0002a23807961460ae8f90e7642414a3；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / dad85b38fac86307e9f429484a7add356e1cae02972a4a79d2c0b9c37b31d62a；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / e2b2e6934e5fd43caa219f29831d58aac3de600efd923a3f8d0580608cfe528d；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Low / calls-loop / e4441dda1dfe5095ad761a73b51eaf5190be52f204c5d0d882fea71e35d88bab；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Low / calls-loop / efba6d52191c302d35760d63926204aae432843da1ec844ce8abee6212fdef3f；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Optimization / constable-states / ea827eed4c6974d4dcf4a439acb0693f9efa8575d3ce352815117e66d76746fa；ROtapTransistors.sol:17；未逐项独立确认，见完整原始输出。
- Informational / cyclomatic-complexity / dd6cecf52dfb5b7f40afdf838a92ba1cfb7f2006fbde0f54a83f833723aa966f；ROtapReferenceRuntime.sol:37；未逐项独立确认，见完整原始输出。
- Informational / dead-code / 02eb5fa8bc443e8ef6d472768ccb878372a2bbd91aef90382437aadf2d06cdd0；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:27；未逐项独立确认，见完整原始输出。
- Informational / dead-code / 10de43c0e01930a1b9fb40f4f6ed72c2f999387cc16e08f742e274689dd237ba；@openzeppelin/contracts/utils/Context.sol:25；未逐项独立确认，见完整原始输出。
- Informational / dead-code / 1bc32e14b2cd40eeb74e8b4a7a5bf6d53101822086877b8378348d224a1f391f；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:31；未逐项独立确认，见完整原始输出。
- Informational / dead-code / 49a89bcb03ac9f03dee56bf5471683c1052698dfd8bb7bd434a220e91e98f8a5；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:21；未逐项独立确认，见完整原始输出。
- Informational / dead-code / 93bd23634a3bf022810e43138345cf58db61248a704a7d277c8ec3d68c3ad188；@openzeppelin/contracts/utils/Context.sol:21；未逐项独立确认，见完整原始输出。
- Informational / dead-code / b7be0afef7320b433868adcae2f0fd430277de8512a950dbdaddc47396bb5c33；@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol:68；未逐项独立确认，见完整原始输出。
- Informational / dead-code / c08d7be4b407d22e4451a143fa4042d32225368689a3638ea9cf7af2856c9eca；@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol:208；未逐项独立确认，见完整原始输出。
- Informational / dead-code / f848a705599c920cc05b5149cba073253b10e77f15f00a51af3928fc861b82cf；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:80；未逐项独立确认，见完整原始输出。
- Informational / dead-code / f8756cda3906aea199f438b412085d8a48f5b42cdbb60790de057f6bbef6eaaa；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:18；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 18c1fb6e0e2637d80e6250779b9844274f5b7da52f1a727a458578aa0fa68eb1；ROtapTransistors.sol:90；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 283a2e98fc2c89efbdc9faf1d7ae05d11cac62424cbe3794e40971d5960a5c62；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 2d839ca44886dffd86c66f722ba354b804a0d627db4086bfbb4ce661900b3da3；ROtapBoost.sol:25；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 2fed8aba4efeeda9656f0158b216245e59c9342ae422ca5a0bd0856f27219d4f；ROtapCircuits.sol:78；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 3e730d125359bd1c6e9bc47aed6b01ac513bbc9d44a31f57b0e8bc128955d91a；ROtapContinuousLedger.sol:49；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 5a54027b5b78abbb59009ea7aad1754f7202263b24202997d415bfcab2ff4185；ROtapContinuousLedger.sol:6；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 5ba549125c5e71cb9606a57fda772ca15ee830a803c07e9812df1bee495b4313；ROtapCircuits.sol:78；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / 82b95c794a506413cfb52c1849cb95f26a99b6ca4236e3ac267ace73e6722dcd；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / bb6a03aa920c162256bb9a2d0b22a2e0ab09ab03677d485e0a452a9a954d9597；ROtapContinuousLedger.sol:46；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / ce5f1eb5eb59e2c3fe6378dc282a6ac35fc31fab730ab7e7e752405f0ad01b87；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Medium / divide-before-multiply / ef4e745ab62615e5290ac4ee5dd652344b6c0f4bf13bb0214a1aac9653bee0b1；ROtapCircuits.sol:78；未逐项独立确认，见完整原始输出。
- Low / events-access / 3d2ab1006e595fc9a4bc5e984ed84936920a6e8941ca2b665fecac79e029e548；ROtapTaskRegistry.sol:22；未逐项独立确认，见完整原始输出。
- Low / events-maths / 114e8331370fa43d12dc8fd0bca69f03c2288697140868e95826bd1ec6aad38d；ROtapSamplingPolicy.sol:18；未逐项独立确认，见完整原始输出。
- Optimization / immutable-states / 12fd6dea399ae7e06c5c53dd3cd4ba63971ab4940a2edb8d8e28101b5451f33c；ROtapContinuousLedger.sol:19；未逐项独立确认，见完整原始输出。
- Medium / incorrect-equality / 397e2288be3e2bab9c97cd0f9ad6305e39415a385df0c8160674a498adf19fc8；ROtapMining.sol:99；未逐项独立确认，见完整原始输出。
- Medium / incorrect-equality / f543b9ad7e898ff8a34c2cb57e98e11cb81d374547f9c2b4f7c2230b5f7472b2；ROtapRewardStakeBoost.sol:38；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 00cc8015efec783a4915010ac1059cda98ce90fadb7e22839904dcb1136b6036；ROtapProcessorFactory.sol:73；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 126403ecfc912dde55dfe41ccd7d8598f7c187139b979f1fa03ff3e9db40e896；ROtapMarkets.sol:24；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 1ae3cc5e89a8a23f9f9604ca0e7f06abb06abcf98aed257c9f641aca92330a39；ROtapTransistors.sol:49；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 282ac5b38e1adc6ee23d7b8adec21a206ff0b7e6d3a85bd166a72eb4d6851cba；ROtapMarkets.sol:45；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 29030057522ec09b3d5d4192b165e79dce9dbb997b2c1257b246bb27b3e7e806；ROtapAccounts.sol:68；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 43b19b9448b89f3e35ace36c568f01c8458a5e61514ad0a2538be733ecc9fdc1；ROtapMarkets.sol:23；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 46384c7d4c669be64f4de1498641266b08c26ee75afe0ae2b4cd3c2790bb79f0；ROtapAccounts.sol:50；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 4d4894662fcc09ce7990dcad053bbc9b20923831b30d135f4cd89caf186f39b9；@openzeppelin/contracts/utils/Address.sol:96；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 5a7512bd78bc0c1d206e65a6a21e012ea400cf8eda6bab972dea29a643557a1f；ROtapStakeBoost.sol:44；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 69256e89f68a4318bdc0974a3e1d0ebaeb36e94891049783232b2d61e6dc13a4；ROtapCircuits.sol:93；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 7742d382fb8731806fcb5a017d4ba27f55173fba382983ec6dee1d1f8d7ce711；ROtapTransistors.sol:82；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 77e40e6a1ecaa532c476de1d81f6f031d62a5c296637565633bd7cd5ed2ec9e5；ROtapAccounts.sol:51；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 88ce9a0de0aa524b68ceaab7b486329b152c4c1a491bd902cfcf9e9a7287f15c；ROtapCircuits.sol:96；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / 97faac19b5143b13a9d3ee8f7e514fee472ab44af3106cb4c853af6f74d50276；ROtapBoost.sol:41；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / c4245651432092bf598b4851384b568ff59dfceda82328fc8cbe0cbcb3623014；ROtapTransistors.sol:69；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / d210ab45bd07a94a716d3e1cc99ba2eea65d91b8918f3cad793ce6afc306d139；@openzeppelin/contracts/utils/Address.sol:33；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / db7971484a09fc28a73537bb831c11ab4b804ccfcb9f604abd083670b8ee450e；@openzeppelin/contracts/utils/Address.sol:87；未逐项独立确认，见完整原始输出。
- Informational / low-level-calls / fad91052447596d50338c873c37739370f27247d8c767567df96b6b9b01a4002；@openzeppelin/contracts/utils/Address.sol:75；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 1eb2603ce97572f064ec0054ed173ec32e936ffcb0f6b4b34252f75b994a4ff3；ROtapCircuits.sol:12；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 23e3c64c8d004ffe6cc75e45508cfabf41ee967be565c6ca92811bb3c6048426；ROtapCircuits.sol:12；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 292160fb5457cd9f10d1bc41852367e7e068ff4035634de669c653b7a8949c43；ROtapMarkets.sol:51；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 3398f7a4ef0344c54fa722b80510e762fd77bf4ef09f2518b48f7448d37d0fe0；ROtapSamplingPolicy.sol:9；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 381cda986a33cdd2d0180f1c85916a82e63a5776c6d61361abc70059d145d1b6；ROtapMining.sol:21；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 55a85e2e0e7faf3b8bb041c3a6fa4f80534e13a64f062d942e5a46b6287ba319；ROtapCircuits.sol:12；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 5a90e2298730ba519cff412c410f8ae25a036947ba4ac3c756787569b7bdbab5；ROtapMining.sol:21；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 624159a1dd6cc0782d418c7754dc52a1dc276f62aef43947b6281bb30cb675ab；ROtapMining.sol:21；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 781453ec65eef87277125e45bab104f0d84a963bd27edf7674c603854175c4a3；ROtapAccounts.sol:59；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / 7b7cd6be2cfa7654b68a510c7e3b885b566ac6b1682720256e7ab04479a3eeff；ROtapCircuits.sol:12；未逐项独立确认，见完整原始输出。
- Informational / missing-inheritance / d1c50e3a9fb56cff6a43c3255e934c94592f4ba25f74dadd9e9f8bda069ddab9；ROtapAccounts.sol:12；未逐项独立确认，见完整原始输出。
- Low / missing-zero-check / 5179527dc7b7551e0b527d313442827d23d692b6f21e5b0e7290a562ec1cac59；ROtapStakeBoost.sol:44；未逐项独立确认，见完整原始输出。
- Low / missing-zero-check / d7051b738a34cfa1e8ec8613eac06a984d51bf237ce11aaadf22df13eb43dac9；@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol:39；未逐项独立确认，见完整原始输出。
- Low / missing-zero-check / e5aecc6d3630c318e10985c77a86183e251070e35a49280cc0e7229d0048dda3；ROtapMining.sol:60；未逐项独立确认，见完整原始输出。
- High / msg-value-in-nonpayable / d2547f35cc1d179d8e12b1226da7cdde51ecfcb0a6d9ea93558b80b7959d6644；@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol:172；上游依赖告警，待独立复核。
- Informational / naming-convention / 279af69e3d74a239896235dfb77680bd4b93859eb30aa47dfa0fa287b1b43d26；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:28；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 389ca359747fe44f5077fb5da7221c004e364d03b159f8b65ff5461680095877；ROtapAccounts.sol:60；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 44eed2fc2a0f405b2d324a0fcdb03d1edab365339934121771b28cfc4c907423；ROtapAccounts.sol:38；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 4d32723caa15d1cbe49c888b6ce925f3742c2dc0fcb9e91d21a0d1e949ba8fc7；ROtapCircuits.sol:14；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 604d451ebbaba9269182fffded431ebd3543130b9937426083f6f1abd4fc9df5；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:51；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 6f62bbafc9048feae796246f8de57a1dd31340a675151229b95208106eb64133；ROtapBoost.sol:5；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 789a5e9117fc7e088319a9417f217369cfcfa16570d60c6001a271cf5b6d3606；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:55；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 8629c89abc9e568d22212182eb038287fc4f676ff34add41294173d644b25bcb；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:21；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 8f9328f0e59a616f6e75f73045eda963af3927a9594f5b5d0d32b2e25206524c；ROtapContinuousLedger.sol:32；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / 8ff7b5e08e6880768da974c4a296eba4ffa484881ed81786ba37c7da4749321d；@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol:68；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / a6910b85395ec08694f8585d867fca8a54d05a15776aca5ce2119c303bccc913；ROtapContinuousLedger.sol:32；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / bfe49cc9b28397f73932ef963ff532a1f0ce51ddd0b26dae025d661602049864；@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol:22；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / cb76c4a025b81b1d34120a39f72a25e8426de1c2f55fbd29d6a5eb8442335219；@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol:65；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / d85e15a950ca051d94e08305a5e2d1b3136c590300d1e6074b89816ca5840186；ROtapContinuousLedger.sol:32；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / e6eb49a8474ee89911571567ab886a806c53ce65d23a5eda711bcaf34fb163ce；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:77；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / e973ab427db5e73a5539828e392d896e87b180e468a609367149a539d6d9ec91；ROtapCircuits.sol:16；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / ec47067e22967ab37ddb79c5eae4c225b0c9f1e4e15f1452db70b0a6f86103e0；@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol:18；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / fbd85c56783523089f3dbfced5e6f8d4e44d909f4e2b7fc7497cac12b8f85e38；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:25；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / fc4325a6cad6bd721babc645e94329da2ee3d99b0ca892c0efd801993e971f20；ROtapAccounts.sol:38；未逐项独立确认，见完整原始输出。
- Informational / naming-convention / ff7188fd803c6119535c59c84febe5219fc17cabd9b56b619f8b9d9185aec81b；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:80；未逐项独立确认，见完整原始输出。
- Informational / pragma / aed2a421b008b8b6d24fe100a464a5f631f6f68f3cc6f67c667655c14845f781；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:4；未逐项独立确认，见完整原始输出。
- Informational / redundant-statements / 8a82d5612468d0e9f30b9987b1698d2fa65692d398db3e8114673536679d5b9b；ROtapTransistors.sol:48；未逐项独立确认，见完整原始输出。
- High / reentrancy-balance / 41c607c27972f86ec153b43f41955aac9ddc94d6bf7137e1b90ef5ab7160296b；ROtapRewardStakeBoost.sol:38；项目已提供上下文，待独立复核。
- Low / reentrancy-benign / 101548ece05df7b3eda61ecf920c85918e8bd0410f5bfa447235bc14da0b5ba3；ROtapMining.sol:136；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / 31959c248140e7cca50b3479cc4bbacec30515a5abbbdcb8ca4a5499cfc1fe04；ROtapStakeBoost.sol:31；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / 34905fbced9d1c6155f137685958b1757943814e59aeeb645f6e3ffaf910c68a；ROtapBoost.sol:41；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / 37f6e6a2436fd110c182251ae0c03c6921da95e5b9c328f26a62b9750e835cd1；ROtapCircuits.sol:86；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / 4b667ae09c521f1f7a02c435264e1c4cfce0894a70086dcc56cf10afeccde6e4；ROtapAccounts.sol:49；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / 7ce7e09c325a3e15c63a6f57ba00a0838f2301e221bb45d5fa4997cbe160bf45；ROtapMining.sol:140；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / a56eb7a3a174c7ae871f28c5e658f5a4282a402610ae0535a126d68a9913abad；ROtapRewardStakeBoost.sol:38；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / abdc6096df5d41eb6030a1825eacaed84a1056664e65dc2f1776926f99730d8f；ROtapAccounts.sol:48；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / b35d632853552eab034ac529826a9cc0265c8bd7b14bb9d0a29eb4a75563468c；ROtapProcessorFactory.sol:48；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / b9fb710871a6283e4a617a60d57a06263d91274e8312c36e2398ef243d186658；ROtapRewardStakeBoost.sol:48；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / cc654f7bfa8b424d2b1eab2254d97955fab817ef2f63df69eab443ec1d818d5f；ROtapCircuits.sol:58；未逐项独立确认，见完整原始输出。
- Low / reentrancy-benign / d863f1790221ee7ed2a78bf3ddb10faf333c57cb9460c8bff54839cc8c515382；ROtapStakeBoost.sol:38；未逐项独立确认，见完整原始输出。
- High / reentrancy-eth / 94b585786cd6effbd554a873b3f60289d7174fe994f0926102d27bbf6053617b；ROtapAccounts.sol:68；项目已提供上下文，待独立复核。
- Low / reentrancy-events / 081194dffa18ee81cc1730e6c6c5535d3067563886e9059eeb736450f1853ab5；ROtapAccounts.sol:68；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / 0a89b7d32e6a2ec7691210535591a7aa1402220a69e98a59e6c24eb60d011fa6；ROtapContinuousLedger.sol:76；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / 3c57b65c87466848ea27c8922897ccb3b1d6196b617be5fdb1da83cca7464d0c；ROtapMining.sol:140；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / 88e1b34e8003b9cc12a428ed75870218294174a7ff042d5ce84fb819302c70ac；ROtapMining.sol:149；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / ac1835f1f53e12db262ae62b39fafbcd8979d8a6fd6a51a6bc90b9c8dc28d5bf；ROtapMining.sol:99；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / bbd77fc1b89e54688576d221832d15b49fe2de274d21b429f08338dd8de00371；ROtapMining.sol:136；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / c1c05422655446bd424e382e1eb20430ada26ac3fbab7f62c506d9604a16840b；ROtapProcessorFactory.sol:74；未逐项独立确认，见完整原始输出。
- Low / reentrancy-events / c52a65a59191a40513ba2d52bffd46c31e705fb41b7bf5b2033c8cb8a0004f6e；ROtapMining.sol:86；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / 1049dc475ca9f9321532ae38ddc94b1bf4f8a786eccfbc7526d3039d8a335f5c；ROtapBoost.sol:41；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / 174c588c8722e0496fb45dbcc87fbb5896b0995ef674fff301fcf7cb13367628；ROtapProcessorFactory.sol:74；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / 1ec8db6a36dc666285e6f05dfb779ae2859f170881e6c323c66e83006e01ff25；ROtapRewardStakeBoost.sol:48；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / 3b9c5fe96ecafc59b578a69f3ae4349152425b7bcc89f5ff0bf3d17813469633；ROtapCircuits.sol:86；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / 446a2f6613d0a1be0d50e688d941011a336e3f4ba16d5c84b8becee25ea4659f；ROtapStakeBoost.sol:38；未逐项独立确认，见完整原始输出。
- Medium / reentrancy-no-eth / b0b740c313ada1cbe5ddb5d736530a5b86822cdc3116f551b5651183b43941a2；ROtapMining.sol:86；未逐项独立确认，见完整原始输出。
- Informational / solc-version / 499d6c11ea36807cff0e18faa603b2584a87110cb94cd0d49fb7a85070758611；@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol:4；未逐项独立确认，见完整原始输出。
- Informational / solc-version / 84f3d3f5f52a89039eecaf4e768ae3b8974ece41fb8b03755347205130d29a55；@openzeppelin/contracts/interfaces/IERC1967.sol:4；未逐项独立确认，见完整原始输出。
- Informational / solc-version / 92d6513b5e863ee6705ff55632494a386a80e733297a4a87515cc176e8477c66；@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol:4；未逐项独立确认，见完整原始输出。
- Informational / solc-version / c64b71d8d4531eb5fbd74258f3f63475dcdc197363f61c916c6d5e0b4e6fed90；@openzeppelin/contracts/interfaces/draft-IERC1822.sol:4；未逐项独立确认，见完整原始输出。
- Informational / solc-version / f6f519a847e07babe44153ee8810fc43c810c6d024bdd5f3967464639f4c00ad；@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol:4；未逐项独立确认，见完整原始输出。
- Low / timestamp / 12b576a12cb6ee3fe6dea8a6f70f07817b454acff86bb7c87f404ff7a6bdcb91；ROtapStakeBoost.sol:44；未逐项独立确认，见完整原始输出。
- Low / timestamp / 27545d20964241a959cb7028b2ab85297f786fd54ed51ead5a52a6bd577bf6d7；ROtapContinuousLedger.sol:44；未逐项独立确认，见完整原始输出。
- Low / timestamp / 28d63d783bbe9d860992083bd86eb08d6d5c9847a91a099c1161dc22e37ff0a3；ROtapContinuousLedger.sol:76；未逐项独立确认，见完整原始输出。
- Low / timestamp / 5d084d2c467805c82505a69a6d5dcad3201117dded45d4c2371a21312a602820；ROtapContinuousLedger.sol:49；未逐项独立确认，见完整原始输出。
- Low / timestamp / 721b5dbb9e62eab1cb9bd989c75a2f23502cac6acc14917cdf34bbd2647d9a4c；ROtapRewardStakeBoost.sol:55；未逐项独立确认，见完整原始输出。
- Low / timestamp / 72e744bb0847d7865fef44a725705803f544e041e22bd6655818ddc5f68a8c0e；ROtapBoost.sol:34；未逐项独立确认，见完整原始输出。
- Low / timestamp / 7ea4ab22765a6e900b116ef58810d9043aa0a5363edd85b1dedfcab05afb3a9f；ROtapMining.sol:99；未逐项独立确认，见完整原始输出。
- Low / timestamp / 93e50e7d8cd351ab78c5beb299873bb57b8245c843dc015d5adf32b6d276543f；ROtapBoost.sol:25；未逐项独立确认，见完整原始输出。
- Low / timestamp / a4ec5454cf34b323c5132e4620eefd073045a37251ffb3782223374c5773f7af；ROtapBoost.sol:41；未逐项独立确认，见完整原始输出。
- Low / timestamp / af414925bf4f9474afce9fcf14e978d94d08e94d2dc0620df2fd11beecc47e8c；ROtapContinuousLedger.sol:46；未逐项独立确认，见完整原始输出。
- Low / timestamp / d3a09819e02a30f944f1a9e8c3a60a55418b476e6016baf61ddc7fb299841822；ROtapContinuousLedger.sol:45；未逐项独立确认，见完整原始输出。
- Low / timestamp / d75abc85567fbbe3d4322726d7345f2982496985b3d28e69b7c59a15231ec9fe；ROtapBoost.sol:35；未逐项独立确认，见完整原始输出。
- Informational / unindexed-event-address / 52932593f77fa411160e1ae0527aa133587b4187ec2c276d41f34d7b8a23b5fe；ROtapProcessorFactory.sol:32；未逐项独立确认，见完整原始输出。
- Informational / unindexed-event-address / d999058f1dbd33f09b6c1e735fb739dfa8446c5d745ae549f11cbd746ee55943；@openzeppelin/contracts/interfaces/IERC1967.sol:18；未逐项独立确认，见完整原始输出。
- Informational / unindexed-event-address / e21ee8bc521508cae5049f98c79ad42a28984be14feab4548fe4b122f6cd11de；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:41；未逐项独立确认，见完整原始输出。
- Informational / unindexed-event-address / e6500e50e2b123805c9216702ab8971cdee77d51bf3684bbc30510649e8b0878；@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol:36；未逐项独立确认，见完整原始输出。
- Informational / unindexed-event-address / f8f59263b8f66916b1dcbbfa9c96363bc9026bbdd4a187d6d7644f5b31da390b；ROtapMarkets.sol:13；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 0259f469454e25034fc00ff9b0b7b75120651af4d460d3240b22d20577572f8b；ROtapRuntime.sol:30；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 312de3d9c3f386d0fc101f322e65b15b282e288035c017fef5fc506bb64bb506；ROtapAccounts.sol:78；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 4762d9d08c3b646adb933eeaa70d19e569c080338fbf1b348ca3bd636f31c4da；ROtapRuntime.sol:14；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 593adadf7aea7c5734c882bb3130713bf0b35f4ba9248cba54ddfd512e3c4b9d；ROtapCircuits.sol:61；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 5e50f05def59141ba7b5e31f49b80548bcf1deca103c36968960c434cb128dd0；ROtapRuntime.sol:62；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 79d94acd4cc2f0451e34df5b512bb39c04cf334804d03f964cdabe00abca920f；ROtapReferenceRuntime.sol:14；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 7a0ea0c885d79f6bc4940a206a8a7088e28e0a4348b9c798fb18569613b85088；ROtapRuntime.sol:44；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 7b4e725e6c5f4b959adcf2cd950e1bd216ca6c017dbe81969a0ba014993e3067；ROtapCircuits.sol:81；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 955463b56842d268005277702101498407e36b2c066738acb6d0a7281913a05f；ROtapRuntime.sol:46；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / 9e9e67e7b396123fe88bc00b2c86628d39ea69df3d0a7e37ce5b21b0ebbc794c；ROtapMining.sol:122；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / c25d8636502e7cd95fbd76a187c18e264de636c6ece014bafa79944556f2bc8f；ROtapTransistors.sol:90；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / c5e6c95d2215b0b3512f26f2ecb36c51ce408dfad7f6b60f5fbd405807f0e7f7；ROtapAccounts.sol:78；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / cb5282fb937d7335d2ddf2c86ae09de1dca1e3797dc624dc296ea1cd4a9e158c；ROtapReferenceRuntime.sol:41；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / d23ead0513549fb51e27533de59701a66fbf4c4256be930dd916028135600049；ROtapMining.sol:122；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / d6f1cc2f7b43aff9cb32697e3d65da1850828f9d2412a0f43567b95d2dcc6b42；ROtapTaskRegistry.sol:59；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / df40f7adca8cab47ddd3e22d80622d1d5f236dbbb1f720ff5d05109377fa37db；ROtapReferenceRuntime.sol:41；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / f970b275673c29781c349f2865a85231e269e6025beba060d995d9da01f3dd43；ROtapRuntime.sol:24；未逐项独立确认，见完整原始输出。
- Medium / uninitialized-local / fa0d4bdc81b47c77433aaa867e53329346a9f69e523796dd7b500b7cdbeba752；ROtapAccounts.sol:78；未逐项独立确认，见完整原始输出。
- High / uninitialized-state / 3e1331cd78d364d3391b4703516c50a4cb515c8c19f1534b49ba3a1f8e839c75；ROtapTransistors.sol:17；项目已提供上下文，待独立复核。
- High / uninitialized-state / 933e7b055033dcba8fb0286a86bb424570a4d3751d9f2a52ad392adaf1c4bc86；ROtapTransistors.sol:18；项目已提供上下文，待独立复核。
- High / uninitialized-state / c054e8af557a5ca7e0b58a28e5c3998375d4d2b24a80d4aa5fb1567ed622dff1；ROtapMining.sol:41；项目已提供上下文，待独立复核。
- Medium / unused-return / 0f3574833ec7b3949aeb0f2b47db8ed036cc7b316091cd5db31144eea83698f1；ROtapTaskRegistry.sol:55；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 2acb9e769c7e4e1f526fa39018e08bc1ee23d39689f613a1b61062e09721f70c；ROtapTaskRegistry.sol:31；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 58563c515c27e3fef7e96fc78c919f113527a673bf0917f6df382b49a560e824；ROtapCircuits.sol:70；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 6c34aaaf514c5ce7d76331b99262dc77b2c12b1e0b88a9af836c588bc54710fd；ROtapMining.sol:79；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 83b4d4bbdc87151aed26f6716c856133152538acdd519efafbe49779840ac430；ROtapMining.sol:157；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 91b644f4f79ca04259ac0633d42c39ca21723d32f5ac6f10febb3d0d767d1f0b；ROtapMining.sol:99；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 97ae938df561dc0e1b50c39b5888565e982fcb5cc32b1fe4b41ad692f267ce96；ROtapTaskRegistry.sol:45；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 9b25dbcf245c97ddb9544397d9e36b548abe8b534ac879428a62b67eb3623489；ROtapCircuits.sol:70；未逐项独立确认，见完整原始输出。
- Medium / unused-return / 9d7fdcfcefd3b8184a2a3094e9535b85d91c88d759966f30933f815d7ebcb87f；ROtapAccounts.sol:68；未逐项独立确认，见完整原始输出。
- Medium / unused-return / ce34e7bd6f95f8ac1417fe9f83bfe1cee49ae7ad17582a84ac1e9541303262ea；ROtapSamplingPolicy.sol:29；未逐项独立确认，见完整原始输出。
- Medium / unused-return / d89deca62b586df7a0f09446358d9517e71bc01b76e9371888557fdd62263e25；@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol:67；未逐项独立确认，见完整原始输出。
- Medium / unused-return / e060fc7218bd0e1584b6836cc393a4bc000d1b9d675dd5185f6869fa9305946d；ROtapMining.sol:121；未逐项独立确认，见完整原始输出。
- Medium / unused-return / e1686f98a0f5c01159f199a46ae9dda4fde5af8c8c3fbe019bc4c69a4cce4e1b；ROtapAccounts.sol:47；未逐项独立确认，见完整原始输出。
- Medium / unused-return / e8c5bd40be3fb8b124227fdb697a1a1c8bab6cf6f2ae74d883d7ff2970d507ec；@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol:157；未逐项独立确认，见完整原始输出。
- High / weak-prng / 0c2187792c648a5af02613cb8270f9c10328016b4749c24acb5c9f2ceb1c2ec8；ROtapSamplingPolicy.sol:25；未解决的机制风险，待独立复核。
- High / weak-prng / b889218fa6aa59724970aa96558835506e1a383e0d61410bece868b9a793a2ef；ROtapBoost.sol:25；项目上下文：周期计算，待独立复核。
