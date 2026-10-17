# ROtap JavaScript 自动化检查

检查由 GitHub Actions 执行，使用 CodeQL 的 `security-extended` 查询。范围为公开源码中的 `source/src` 与 `source/scripts` JavaScript；Solidity 合约不在 CodeQL 的检查范围内。

本记录属于自动化静态分析，不是独立人工审计或资金安全证明。

## 修复后结果

- [GitHub 原始执行记录](https://github.com/LIFNF/rotap/actions/runs/39016457782)
- 检查提交：`786123d0fc918443c3257d99b2992b13ae524c33`
- 执行结果：success；SARIF 工具结果为 0 项。
- [完整 SARIF](codeql.sarif)
- [范围、文件 SHA-256 和原始报告校验值](codeql-summary.json)

公开报告保存每个被检查 JavaScript 文件的校验值。当前文件必须与该记录一致，不能将此结果自动沿用到修改后的代码。

## 三处问题及修复

首次检查在三个本地工具脚本中报告 `js/file-system-race`。路径检查与后续读取之间可能发生文件变化：

1. `scripts/github-security-results.mjs`：删除先判断报告文件存在再读取的流程，直接读取，只将 ENOENT 视为缺失。
2. `scripts/reference-fork-provider.mjs`：直接读取缓存，缺失时才进入网络读取；损坏缓存和其他文件错误继续报错。
3. `scripts/test-github-pages.mjs`：打开文件后，对同一文件描述符执行状态检查和读取，并在 finally 关闭；保留目录重定向与 index 页面行为。

修复后进行了脚本语法检查、缓存命中与异常回归，以及完整 Pages 浏览器验收。以上三项未再出现在修复版本的 CodeQL 输出中。

- [修复前完整 SARIF](codeql-before-fixes.sarif)
- [修复前提交及执行记录](codeql-before-fixes-summary.json)
- [结构化修复记录](codeql-fixes.json)

## 检查限制

0 项工具结果不等于不存在漏洞。此结果不覆盖 Solidity、密钥保管、运营钱包支出、交易池或经济可持续性。合约检查另见 [Slither 报告](slither-report.md)；其中尚未解决的抽样风险和待独立复核的告警继续保留。当前尚未完成独立人工审查，不能将本报告用于宣称项目已通过独立审计。

[CodeQL 官方说明](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-code-scanning)
