# Team AI CLI

中文 | [English](README.md)

`team-ai` 是一个建立在 GitHub Copilot 原生能力之上的轻量 Team Control Layer。它的目标是让团队统一使用共享 AI capabilities，同时避免再造一套 Agent Runtime、Plugin 标准或 IDE 适配层。

它只负责：**初始化、Role 选择、Copilot Marketplace / Plugin 收敛、项目接入、状态与诊断、机器本地状态**。共享能力仍然使用标准 Agent Plugins；项目专属能力仍然保存在真实业务 Repo 的 `.github/*` 中。

## 架构

```text
teamai-marketplace
  .github/plugin/marketplace.json
  plugins/
    common
    role-api
    role-ios
    role-aos
    role-qa
    role-design
    product-teamai
    product-*（出现其他真实需求后再增加）
             |
             | Copilot 原生 marketplace/plugin 命令
             v
GitHub Copilot CLI / VS Code / 其他 Copilot Surface
             ^
             |
真实业务 Git Repo
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/

team-ai CLI
  bootstrap + role + sync + status + doctor
  machine state -> ~/.team-ai/
```

能力归属保持简单：

| 能力 | 所有者 / 位置 |
| --- | --- |
| Common | 用户级 `common@teamai` Plugin |
| Role | 用户级 `role-<role>@teamai` Plugin |
| Product | 由业务 Repo settings 声明启用的 `product-*` Plugin |
| Project | 真实业务 Repo 中的原生 `.github/*` |
| Machine state | `~/.team-ai/` |

## 环境要求

- Node.js 20+
- Git
- GitHub Copilot CLI，可通过 `copilot` 命令调用

先确认：

```text
copilot --version
```

## 本地开发安装

```text
npm install
npm run build
npm link
```

完成后应可直接调用 `team-ai`。

本地开发 Marketplace 时，可在第一次初始化前指定 Marketplace checkout：

```powershell
$env:TEAM_AI_MARKETPLACE_SOURCE = "F:\path\to\teamai-marketplace"
team-ai init --role api
```

正常团队使用时默认 Marketplace source 为 `teamai-vault/teamai-marketplace`。

## 修改 Marketplace ID

Copilot Marketplace ID 与 GitHub Organization / Repo 名称是相互独立的。如果最终内部名称需要结合部门或团队名称，不要手工逐文件替换，使用内置 rename 工具：

```text
npm run rename:marketplace -- --from teamai --to payments-platform-ai --dry-run
npm run rename:marketplace -- --from teamai --to payments-platform-ai --display-name "Payments Platform AI"
```

该工具会同步修改两个 sibling Repo 中与 Marketplace 身份相关的内容，包括 Marketplace manifest、CLI 默认 ID、`common@teamai` 这类 Plugin spec、Copilot source marker、测试和文档，并在结束时检查旧 Marketplace ID 是否仍有独立 token 残留。

它会明确保护以下 Repo / package 身份，不会因为 Marketplace 改名而修改：

```text
teamai-vault
teamai-marketplace
teamai-cli-customization
```

如果两个 Repo 不在 sibling 目录，可显式传路径：

```text
npm run rename:marketplace -- --to payments-platform-ai --cli-repo <path> --marketplace-repo <path>
```

建议永远先执行 `--dry-run`，正式改名后再运行 build/typecheck/tests，并执行一次真实 Copilot Marketplace smoke test。

这个脚本只修改当前两个源码 Repo。如果旧 Marketplace ID 已经下发给同事使用，还需要额外规划运行时迁移：

- 每台开发机已经注册的 Copilot Marketplace，以及已安装的 `*@<old-id>` Plugin；
- `~/.team-ai/config.yaml` 中的 `marketplace.name` 和 `managedPlugins`；
- 已经在 `.github/copilot/settings.json` 中声明旧 ID 的业务 Repo，包括 `extraKnownMarketplaces` 和 `enabledPlugins`。

因此在正式推广前改名成本很低；推广之后再改名，应当视为一次小型迁移，而不只是源码 rename。

## 命令

```text
team-ai init [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

所有写操作支持全局 `--dry-run`：

```text
team-ai --dry-run init --role api
team-ai --dry-run sync
team-ai --dry-run role set design
```

### `team-ai init`

机器第一次初始化：

```text
team-ai init --role api
```

它会：

1. 检查 Copilot CLI；
2. 通过原生 `copilot plugins` 命令注册公司 Marketplace；
3. 收敛 `common@teamai` 和当前 `role-*` Plugin；
4. 将 Role 与 Team AI 自己拥有的 Plugin 记录到 `~/.team-ai/config.yaml`；
5. 如果当前位于 Git Repo 中，识别 workspace 与 machine partition；
6. 可选地验证并通过 repository settings 声明 `product-*` Plugin。

它**不会**把中央 Skills、Agents、Hooks 或 MCP 复制到业务项目。

### `team-ai sync`

这里的 `sync` 表示 **Converge / Repair**，不是 TeamAI 风格的资源复制。它通过 Copilot 原生 Plugin Manager 收敛 Team AI 自己管理的 Common / Role Plugin，并刷新 machine state。

### `team-ai role`

```text
team-ai role list
team-ai role set design
```

切换 Role 时，只会 disable Team AI 自己拥有的旧 Role Plugin。用户原本手工安装的 Plugin 不会被 Team AI 擅自接管。

### `team-ai status`

只读展示全局 Role / Plugin 状态、当前 Git Project identity、Product 声明、项目原生 Copilot customization 和 machine partition。

### `team-ai doctor`

只读检查 Git、Copilot CLI、Marketplace / Plugin、repository settings、Product 声明、machine state 可写性以及 stale/orphan partition。

## 全局配置

机器本地配置位于：

```text
~/.team-ai/config.yaml
```

示例：

```yaml
version: 1
marketplace:
  name: teamai
  repository: teamai-vault/teamai-marketplace
role: api
managedPlugins:
  - common@teamai
  - role-api@teamai
```

`managedPlugins` 是明确的 ownership boundary：只有 Team AI 自己安装/拥有的 Plugin，才允许由 CLI enable、update 或 disable。

## Project 模型

真实业务 Git Repo 本身就是 Project Scope。项目专属 Copilot customization 跟代码一起保存：

```text
.github/
  copilot/
    settings.json
  copilot-instructions.md
  skills/
  agents/
  instructions/
  hooks/
```

执行 `team-ai init --product payments` 时，会先验证 Marketplace 中确实存在 `product-payments`，然后对 `.github/copilot/settings.json` 做 read-modify-write。未知字段、其他 Marketplace 和用户自己的其他 Plugin 都会保留。

不会创建额外的 `*-team-ai` sibling repo。

## Machine state 与 Git worktree

机器专属状态完全放在业务 Repo 之外：

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

`workspaceRoot` 表示当前 checkout/worktree；`projectAnchor` 表示稳定的 main-worktree project identity，用于 partition key。因此多个 Git worktree 可以共享项目身份，同时不会把机器状态写进业务 Repo。

写入使用 atomic replace，并为 project partition 使用 lock file。

## 验证与测试

```text
npm run build
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e:copilot
npm test
```

Integration tests 使用 fake Copilot executable，但会实际创建临时 Git Repo / worktree。因此它们明确属于 integration，不会被描述成真实 Copilot E2E。

先执行 `npm run build`，再运行 `npm run test:e2e:copilot`，会使用已安装的真实 Copilot CLI、隔离的临时 profile/Git Repo 与 sibling Marketplace checkout，验证 `init --product teamai` 及 `doctor`。

Release 前还应使用真实 Copilot CLI 验证。最新验证情况见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

## 当前明确不做

- 非 Copilot Agent Runtime 或 IDE adapter；
- 替代 Copilot Plugin Manager 或 Copilot `/init`；
- 自定义 Plugin / Skill / Hook / MCP 格式；
- 自己复制或转换中央 Skills / Agents / Hooks / MCP；
- 通用 overlay / patch / merge engine；
- TeamWiki、Recall、Learning、telemetry、dashboard。

后续优先级见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

## 项目文档

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)：根据冻结架构整理的正式 Implementation Plan。
- [`docs/HANDOFF.md`](docs/HANDOFF.md)：当前实现状态、验证证据、遗留问题与后续优先级。
- [`docs/VERSIONING.md`](docs/VERSIONING.md)：CLI、Marketplace 与 Plugin 的发布/版本规则。
- [`docs/codex-first-review.md`](docs/codex-first-review.md)：统一的实现审查发现与处置状态。
