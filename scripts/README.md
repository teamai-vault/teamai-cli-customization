# Marketplace Rename Tool

[中文](#中文) | [English](#english)

## 中文

`rename-marketplace.mjs` 是一个 **Marketplace maintainer utility**。它用于给某一个部门自己的 GitHub Copilot Marketplace 改逻辑 ID，例如：

```text
teamai -> payments-platform-ai
```

它不会修改通用 `team-ai` CLI。CLI 与部门 Marketplace identity 已经解耦。

### 推荐流程

先 dry-run：

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI" `
  --dry-run
```

确认后执行：

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI"
```

如果 Marketplace Repo 不在默认 sibling 位置：

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --marketplace-repo F:\path\to\department-marketplace `
  --dry-run
```

### 参数

| 参数 | 必需 | 作用 |
| --- | --- | --- |
| `--to <id>` | 是 | 新 Marketplace ID |
| `--from <id>` | 推荐 | 必须与 manifest 当前 ID 一致，否则拒绝执行 |
| `--display-name <name>` | 否 | 同时修改 Marketplace owner/display name |
| `--marketplace-repo <path>` | 否 | 目标 Marketplace Repo；默认 sibling `../teamai-marketplace` |
| `--dry-run` | 推荐先用 | 只预览，不写文件 |
| `--help` | 否 | 显示帮助 |

### 修改范围

脚本读取目标 Marketplace 的：

```text
.github/plugin/marketplace.json
```

其中 `name` 是当前 Marketplace ID。

脚本只扫描 **目标 Marketplace Repo**，修改其中的独立 Marketplace identity token，例如：

```text
common@teamai
role-api@teamai
marketplace:teamai
live-marketplace:teamai
README 中的命令和示例
```

它不会扫描或修改 `teamai-cli-customization`。

它也不会把 Repo/package 名称做全局替换。例如：

```text
teamai-vault
teamai-marketplace
```

不会因为 Marketplace ID 改名而被错误修改。

### rollout 后的额外迁移

该脚本只改源码 Repo。如果旧 Marketplace ID 已经被开发者使用，还要单独迁移：

1. Copilot Marketplace registration；
2. 已安装的 `*@<old-id>` Plugin；
3. `~/.team-ai/config.yaml`；
4. `~/.team-ai/projects/*/state.json` 中的旧 Plugin spec（如有）；
5. 业务 Repo `.github/copilot/settings.json` 中的旧 ID。

所以最好在大规模 rollout 前确定最终 Marketplace 名称。

### 改名后的验证

Marketplace Repo：

```powershell
npm run validate
npm test
```

再使用真实 Copilot CLI 做一次 add / browse / install smoke test。

## English

`rename-marketplace.mjs` is a **Marketplace maintainer utility**. It renames the logical Copilot Marketplace ID inside one Marketplace repository.

It deliberately does **not** modify the generic `team-ai` CLI because CLI identity is independent from department Marketplace identity.

Recommended workflow:

```powershell
npm run rename:marketplace -- `
  --from teamai `
  --to payments-platform-ai `
  --display-name "Payments Platform AI" `
  --dry-run
```

Then run the same command without `--dry-run`, validate the Marketplace repository, and perform a real Copilot smoke test.

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

`smoke-team-ai.mjs` creates an isolated temporary Copilot profile and Git repository, runs `team-ai init --marketplace <sibling-marketplace-path> --role api --product teamai` plus `doctor`, verifies the native repository settings declaration, and removes the temporary state in a `finally` block.
