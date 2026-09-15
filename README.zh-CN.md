# Team AI CLI

中文 | [English](README.md)

`team-ai` 是建立在 GitHub Copilot 原生能力之上的轻量 Control Layer，用于统一团队共享能力，同时避免再造 Agent Runtime、Plugin 标准或 IDE 适配层。

CLI 与任何具体部门的 Marketplace **明确解耦**。公司可以统一维护、安装一份 CLI，不同部门各自维护自己的 Copilot Marketplace。

## 架构

```text
                    team-ai CLI
                  公司统一控制面
                         |
                         | init --marketplace <source>
                         v
                  部门 Marketplace
              .github/plugin/marketplace.json
                         |
                         | manifest.name
                         v
              common@<marketplace>
              role-<role>@<marketplace>

真实业务 Repository
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/
```

CLI 不再内置默认部门 Marketplace。`teamai-vault/teamai-marketplace` 只是 Reference / Template Marketplace，不是 CLI 的固有依赖。

## 环境要求

- Node.js 20+
- Git
- GitHub Copilot CLI，可通过 `copilot` 调用

## 本地开发安装

```text
npm install
npm run build
npm link
```

## 第一次初始化

首次初始化必须显式指定 Marketplace source：

```powershell
team-ai init `
  --marketplace https://github.com/example-org/department-ai-marketplace.git `
  --role api
```

`--marketplace` 会直接交给 Copilot 原生 Marketplace 注册命令。GitHub Copilot CLI `1.0.83` 原生支持：

```text
owner/repo
owner/repo#ref
https://...
ssh://...
git@host:owner/repo.git
本地路径
```

公司内部文档可以统一使用完整 Git URL，例如：

```text
https://github.com/example-org/payments-ai-marketplace.git
```

用户不需要再填写 Marketplace name。CLI 先通过 Copilot 注册 source，再从 Copilot 的注册结果中取得由 `.github/plugin/marketplace.json` 决定的真实 registration key。

最终配置类似：

```yaml
version: 2
marketplace:
  name: payments-ai
  source: https://github.com/example-org/payments-ai-marketplace.git
role: api
managedPlugins:
  - common@payments-ai
  - role-api@payments-ai
```

第一次初始化完成后，`sync / role / status / doctor` 以及后续 `init` 都直接读取已保存 Marketplace，不再要求 `--marketplace`。

如果已经初始化后又传入另一个不同 source，当前版本会明确拒绝 silent switch。Marketplace migration 不是当前 MVP 范围。

本地相对路径会在首次初始化时解析成绝对路径再保存，避免之后因为工作目录变化而失效。

## 命令

```text
team-ai init [--marketplace <source>] [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

所有写操作支持全局 `--dry-run`。

首次 `--dry-run` 时，如果远端 Marketplace 尚未注册，CLI 无法在不产生 Copilot mutation 的前提下知道 manifest-derived name。此时只预览 Marketplace add，并明确跳过 Plugin / config / project preview，不伪造结果。

### `team-ai init`

首次初始化：

```text
team-ai init --marketplace <source> --role <role>
```

流程：

1. 检查 Copilot CLI；
2. 使用 Copilot 原生命令注册指定 source；
3. 从 Copilot 注册结果发现 Marketplace name；
4. 收敛 `common@<marketplace>` 与当前 `role-*` Plugin；
5. 将 Marketplace source/name、Role、Team AI-owned plugins 写入 `~/.team-ai/config.yaml`；
6. 可选验证并通过 repository settings 声明 `product-*` Plugin。

不会把中央 Skills、Agents、Hooks 或 MCP 复制进业务 Repo。

### `team-ai sync`

`sync` 表示 Converge / Repair，而不是复制资源。

### `team-ai role`

```text
team-ai role list
team-ai role set design
```

切换 Role 只会 disable Team AI 自己拥有的旧 Role Plugin，不会擅自接管用户原本安装的 Plugin。

### `team-ai status` / `team-ai doctor`

检查当前已配置 Marketplace、Plugin 状态、Repository settings、Git project identity 与 machine state。当前不会做多个 Marketplace 的选择、merge、overlay 或 precedence。

## 配置兼容

当前 config schema 为 `version: 2`，使用：

```yaml
marketplace:
  name: <manifest-derived-name>
  source: <copilot-marketplace-source>
```

旧 `version: 1` 中的：

```yaml
marketplace:
  repository: <source>
```

仍然可以读取，并在内存中迁移到 v2；下一次正常写 config 时会落盘成新格式。

## Project 模型

真实业务 Git Repo 就是 Project Scope。项目专属 Copilot customization 继续跟代码保存在 `.github/*`。

`team-ai init --product payments` 会先确认当前 Marketplace 中存在 `product-payments`，再 read-modify-write `.github/copilot/settings.json`，保留未知字段、其他 Marketplace 和其他 Plugin。

## Machine state 与 Git worktree

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

`workspaceRoot` 是当前 checkout/worktree；`projectAnchor` 是稳定的 main-worktree identity。

## Reference Marketplace 与部门模板

`teamai-vault/teamai-marketplace` 现在定位为 **Reference / Template Marketplace**。

其他部门可以 clone / derive 这份模板，设置自己的 manifest `name`，维护自己的 Common / Role / Product capabilities，然后继续使用完全相同的公司级 CLI：

```powershell
team-ai init `
  --marketplace https://github.com/example-org/mobile-ai-marketplace.git `
  --role ios
```

不需要 fork CLI。

## Marketplace rename 工具

`scripts/rename-marketplace.mjs` 现在明确是 **Marketplace maintainer utility**：只负责某个 Marketplace Repo 自己的逻辑 ID 改名，不再修改通用 CLI。

```text
npm run rename:marketplace -- --from teamai --to payments-platform-ai --dry-run
npm run rename:marketplace -- --from teamai --to payments-platform-ai --display-name "Payments Platform AI"
```

详见 [`scripts/README.md`](scripts/README.md)。

## 验证与测试

```text
npm run build
npm run typecheck
npm run test:unit
npm run test:integration
npm test
```

Fake Copilot integration 不会被描述成真实 E2E。真实 Copilot 验证记录见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

## 当前明确不做

- 默认部门 Marketplace；
- multi-Marketplace selection / merge / overlay / precedence；
- Marketplace package manager；
- 非 Copilot Agent Runtime 或 IDE adapter；
- 自定义 Plugin / Skill / Hook / MCP 格式；
- 通用 overlay engine；
- TeamWiki、Recall、Learning、telemetry、dashboard。

## 项目文档

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)
- [`docs/HANDOFF.md`](docs/HANDOFF.md)
