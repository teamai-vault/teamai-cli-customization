# Marketplace Rename Tool

[中文](#中文) | [English](#english)

## 中文

`rename-marketplace.mjs` 用于在 **Team AI 两个源码仓库** 中安全地修改 GitHub Copilot Marketplace 的逻辑 ID，例如：

```text
teamai -> payments-platform-ai
```

它解决的是“源码中的 Marketplace 身份改名”，避免人工搜索/替换遗漏，同时避免错误修改 GitHub Organization、Repository、npm package 等其他包含相同文本的名称。

### 推荐使用方式

进入 `teamai-cli-customization`：

```powershell
cd F:\agent-workspace\multiAgent\teamai-cli-customization\teamai-cli-customization
```

先执行 dry-run：

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI" `
  --dry-run
```

确认预览结果无误后再正式执行：

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI"
```

然后运行验证：

```powershell
npm run typecheck
npm test
npm run build
```

如果这次改名会正式发布，还建议再使用真实 Copilot CLI 做一次 Marketplace add/browse/install/doctor smoke test。

### 参数

| 参数 | 必需 | 作用 |
| --- | --- | --- |
| `--to <id>` | 是 | 新的 Marketplace ID |
| `--from <id>` | 推荐 | 安全保护；必须与 manifest 当前 ID 一致，否则拒绝执行 |
| `--display-name <name>` | 否 | 同时修改 Marketplace owner/display name |
| `--dry-run` | 推荐先用 | 仅预览，不写文件 |
| `--marketplace-repo <path>` | 否 | Marketplace repo 路径；默认 sibling `../teamai-marketplace` |
| `--cli-repo <path>` | 否 | CLI repo 路径；默认当前脚本所属 repo |
| `--help` | 否 | 显示帮助 |

### 脚本会修改什么

脚本会读取：

```text
teamai-marketplace/.github/plugin/marketplace.json
```

并将其中的 Marketplace `name` 作为当前真实 ID。

然后同步修改两个 Repo 内与 **Marketplace 身份语义** 相关的内容，例如：

```text
common@teamai
role-api@teamai
marketplace:teamai
live-marketplace:teamai
Marketplace 配置中的 name
README / HANDOFF / IMPLEMENTATION-PLAN 中的命令和示例
```

CLI 默认 Marketplace ID 也集中在：

```text
teamai-cli-customization/src/config/schema.ts
MARKETPLACE_NAME
```

### 脚本明确不会修改什么

它不是对字符串 `teamai` 做全局替换。

例如这些 Repository / package identity 会被保留：

```text
teamai-vault
teamai-marketplace
teamai-cli-customization
```

所以：

```text
teamai -> payments-platform-ai
```

不会误变成：

```text
payments-platform-ai-vault
payments-platform-ai-marketplace
payments-platform-ai-cli-customization
```

脚本执行结束后会再次扫描旧 Marketplace ID；如果仍发现应该迁移的独立旧 token，会直接失败，而不是报告成功。

### 改名后仍需人工确认的内容

这个工具只修改 **Team AI 源码仓库**。

如果旧 Marketplace ID 已经发给团队成员使用，还必须单独处理运行时迁移：

1. 开发者机器上的 Copilot Marketplace 注册；
2. 已安装的 `common@<old-id>` / `role-*@<old-id>` Plugin；
3. `~/.team-ai/config.yaml`；
4. `~/.team-ai/projects/*/state.json` 中可能存在的旧 Plugin spec；
5. 业务 Repository 的 `.github/copilot/settings.json`。

例如：

```json
{
  "extraKnownMarketplaces": {
    "old-marketplace-id": {}
  },
  "enabledPlugins": {
    "product-example@old-marketplace-id": true
  }
}
```

因此最好在大规模团队 rollout **之前**确定最终 Marketplace 名称。

### 建议的完整改名流程

```text
1. 与团队确认最终 Marketplace ID / display name
2. git status，确保知道当前未提交修改
3. rename:marketplace --dry-run
4. 检查 diff
5. 正式执行 rename:marketplace
6. npm run typecheck
7. npm test
8. npm run build
9. 使用真实 Copilot CLI 做 smoke test
10. commit / push Marketplace repo
11. 再使用远端 Marketplace source 做 E2E
12. commit / push CLI repo
13. 如果已 rollout，再执行开发机和业务 repo migration
```

## English

`rename-marketplace.mjs` safely renames the logical GitHub Copilot Marketplace ID across the two Team AI source repositories.

Recommended workflow:

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI" `
  --dry-run
```

Then, after reviewing the preview:

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI"
```

The tool renames Marketplace identity tokens such as `common@teamai`, `role-api@teamai`, `marketplace:teamai`, and `live-marketplace:teamai`.

It deliberately preserves repository/package identities such as `teamai-vault`, `teamai-marketplace`, and `teamai-cli-customization`.

Always run `--dry-run` first, inspect the Git diff, then run typecheck/tests/build after the real rename.

This tool changes source repositories only. If the old Marketplace ID has already been deployed to developer machines or business repositories, migrate Copilot registrations, `~/.team-ai/*`, and `.github/copilot/settings.json` separately.

## Real Copilot Product E2E

After building the CLI, run:

```text
npm run test:e2e:copilot
```

`smoke-team-ai.mjs` creates an isolated temporary Copilot profile and Git repository, runs `team-ai init --role api --product teamai` plus `doctor` against the sibling Marketplace checkout, verifies the native repository settings declaration, and removes the temporary state in a `finally` block.
