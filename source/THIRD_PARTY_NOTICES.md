# 来源、许可证与修改说明

本项目独立编写部分采用 MIT。该许可不覆盖第三方品牌、原站代码或其他权利人的研究资料。

- OpenZeppelin Contracts 与 Contracts Upgradeable 5.4.0：MIT，https://github.com/OpenZeppelin/openzeppelin-contracts 与 https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable。通过原始 npm 依赖导入，未修改上游文件。使用 Ownable、UUPS、ERC-1967、Beacon；正式发布前放弃管理与升级权。
- ethers 6.15.0：MIT，https://github.com/ethers-io/ethers.js。用于钱包、编码与链上读取，未修改上游文件。
- esbuild 0.25.10：MIT，https://github.com/evanw/esbuild。仅为构建工具，未修改。
- solc-js 0.8.30：MIT，https://github.com/ethereum/solc-js。仅为编译工具；Solidity 编译器自身遵守其上游许可，未修改。
- Ganache 7.9.2：MIT，https://github.com/trufflesuite/ganache。仅为本地测试，不参与正式钱包托管或远程签名，未修改。
- Playwright 1.56.0：Apache-2.0，https://github.com/microsoft/playwright。仅为浏览器验收，未修改。
- Fusion Pixel 中文字体 5.3.0：SIL OFL-1.1，https://github.com/TakWolf/fusion-pixel-font。分发原始字库文件与 OFL，未修改字形，未改变保留名称。
- ERC-6551：https://eips.ethereum.org/EIPS/eip-6551。按公开标准独立实现账户接口，正式部署复用该链已存在的标准 registry，地址与代码哈希单独核验，不将其计为本项目新部署。

直接依赖许可证原文位于 licenses/，完整依赖版本与传递依赖许可元数据保留在 package-lock.json。前端打包器保留上游许可注释。

Fab X（https://fabx.tech）是行为研究来源，不是本项目的授权方。未获取其完整 Solidity 源码，也没有据此声称源码级等价。公开包不包含下载的原站压缩 JavaScript、HTML 或图片。历史公开接口、RPC 结果、向量与参考电路仅标注来源，不以本项目 MIT 许可重新授权第三方内容。参考数据再分发权及生产使用适用性仍须独立审查；权利疑问未解决前不开启收费。

相对研究对象的明确改动包括：品牌与网络、固定 ETH 价格、ROTAP 质押替代、统一付费、固定发行接口、永久放弃管理权、独立前端与可复现构建。价格换算属于历史初始配置，不是价格预言机。
