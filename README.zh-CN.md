# Team AI CLI

中文 | [English](README.md)

`team-ai` 是建立在 GitHub Copilot 原生能力之上的轻量控制层，用于统一团队共享能力。Agent Plugin、部门 Marketplace 和项目本地 `.github/*` customization 都留在各自的原生位置，不新增另一套 Runtime 或 Plugin 格式。

CLI 与任何具体部门 Marketplace 解耦。每个用户绑定一个 Marketplace source；不同部门可以维护自己的 Marketplace，同时使用同一份 CLI。

## 架构

```text
                    teamai CLI
                  公司统一控制面
                         |
                         | init --marketplace <source>
                         v
                  部门 Marketplace
              .github/plugin/marketplace.json
                         |
                         | manifest.name + plugin metadata
                         v
              common@<marketplace>
              api@<marketplace>
              ios@<marketplace>
              aos@<marketplace>
              qa@<marketplace>
              design@<marketplace>

真实业务 Repository
  .github/copilot/settings.json
  .github/copilot-instructions.md
  .github/skills/
  .github/agents/
  .github/instructions/
  .github/hooks/
```

CLI 不内置部门 Marketplace。`teamai-vault/teamai-marketplace` 是本 workspace 使用的 Reference / Template Marketplace，不是 CLI 依赖。

## 环境要求

- Node.js 20+
- Git
- 可选后端：GitHub Copilot CLI（`copilot`，优先）或 VS Code（`code`，fallback）

## 本地开发安装

```text
npm install
npm run build
npm link
```

## Marketplace 与 Plugin contract

`--marketplace` 接受 Copilot 原生 source：GitHub `owner/repo`、带 ref 的引用、HTTP(S)/SSH/git URL 或本地路径。相对本地路径会在保存前解析成绝对路径。CLI 从已加载 Marketplace 的 manifest 发现真实 name，用户不需要重复填写 name。

Marketplace 发布的 Plugin 名称为：

```text
common
api
ios
aos
qa
design
```

Plugin 名称不再编码 kind。CLI 读取统一的 metadata namespace `com.company.teamai`：

```json
{
  "name": "api",
  "extensions": {
    "com.company.teamai": {
      "kind": "role"
    }
  }
}
```

`kind` 取 `common`、`role` 或 `product`。如果未来必须修改 namespace，必须同时更新 CLI 中的 `TEAM_AI_EXTENSION_NAMESPACE` 常量，以及所有 Marketplace `plugin.json` 的 `extensions` namespace。

## 第一次初始化

首次初始化支持四种交互组合：

```text
team-ai init                                             # 依次询问 Marketplace、Role
team-ai init --marketplace <source>                      # 只询问 Role
team-ai init --role api                                  # 只询问 Marketplace
team-ai init --marketplace <source> --role api           # 不询问
```

在交互式终端中，Role picker 使用 Marketplace 暴露的 role Plugin，只选择一个 Role。在 CI、stdin 重定向或其他 non-TTY 环境中，缺少必填值时直接报错，不进入 prompt。自动化环境应显式提供：

```text
team-ai init --marketplace <source> --role <role>
```

初始化会：

1. 检查 Copilot CLI；可用时优先选择 native backend；
2. 加载 Marketplace 并发现 manifest name；
3. 必要时通过 Copilot 原生操作注册 source；
4. 安装目录中所有 `kind: role` Plugin 与 `common`；
5. 只启用 `common` 和当前选择的 Role；
6. 保存 Role、Marketplace identity 和明确的 Team AI ownership；
7. 如指定 Product，则先校验目录，再在真实业务 Repo settings 中声明。

Product Plugin 不在 User Scope 安装。当前 Product 路径保持既有 `product-*` Plugin 命名（例如 `product-teamai`），只在 `.github/copilot/settings.json` 中声明启用，并且必须先通过 Marketplace catalog 校验。

保存后的配置示例：

```yaml
version: 1
marketplace:
  name: payments-ai
  source: https://github.com/example-org/payments-ai-marketplace.git
role: api
managedPlugins:
  - common@payments-ai
  - api@payments-ai
  - ios@payments-ai
  - aos@payments-ai
  - qa@payments-ai
  - design@payments-ai
```

config schema 固定为 `version: 1`，唯一的 Marketplace source 字段为 `marketplace.source`。初始化后，普通命令使用已保存的 Marketplace；再次提供不同 source 时会拒绝静默切换。

## 命令

```text
team-ai init [--marketplace <source>] [--role api|ios|aos|qa|design] [--product <name>]
team-ai sync
team-ai role list
team-ai role set <role>
team-ai status
team-ai doctor
```

所有写操作支持全局 `--dry-run`。首次 dry-run 会读取给定 Marketplace 并显示计划中的 Marketplace、Plugin、config 与 project 改动，不产生实际 mutation。

### `team-ai sync`

`sync` 表示 convergence / repair：补齐缺失的 Team AI-owned User Plugin，恢复 enablement，刷新 Marketplace 注册和 VS Code Marketplace 注册，并刷新 Project machine state。它不会把中央 Skills、Agents、Instructions、Hooks 或 MCP 定义复制进业务 Repo。

### `team-ai role`

```text
team-ai role list
team-ai role set qa
```

切换 Role 时所有 Team AI role Plugin 保持安装，只启用 `common` 与新 Role，并 disable 其他 Team AI-owned Role。用户预先安装的 Plugin 不会因为名字相似而被 claim，也不会被擅自修改。

### `team-ai status` 与 `team-ai doctor`

两者检查 config、Marketplace/Plugin 状态、native MCP metadata、VS Code 注册、Project settings、Git identity 和 machine state。Hook 声明可静态校验，但 CLI 不执行 Hook，也不把不可用的 runtime inspection 伪装成成功。

## Native Copilot 与 VS Code-only fallback

检测到 `copilot` 时，Team AI 使用原生 command family：

```text
copilot plugins marketplace add ...
copilot plugins marketplace list --json
copilot plugins marketplace browse <name> --json
copilot plugins install ...
copilot plugins enable ...
copilot plugins disable ...
copilot plugins update ...
```

没有 Copilot CLI 但检测到 `code` 时，Team AI 使用 VS Code-compatible fallback。Fallback 读取相同的 Marketplace/Plugin contract，把 managed Plugin materialize 到 Copilot-compatible 目录，并 merge Copilot metadata：

```text
~/.copilot/installed-plugins/<marketplace>/<plugin>
~/.copilot/config.json
~/.copilot/settings.json
```

Fallback 写入 `installedPlugins` inventory 与 `enabledPlugins` 状态；`settings.json.enabledPlugins` 是 effective enablement authority，`config.json` 中的 inventory flag 与之同步。未知字段和已有 `source_sha` 都必须保留；fallback 新建的 row 不自行计算 synthetic `source_sha`。

## Copilot 与 VS Code Marketplace 注册

User-level Copilot 注册由 `~/.copilot/settings.json` 的 `extraKnownMarketplaces` 表示。Native backend 让 Copilot 原生命令负责这项更新；fallback 只 merge 当前 Marketplace 条目，并保留未知/native 字段。

Team AI 同时在 VS Code User Settings 的 `chat.plugins.marketplaces` 中注册 source。合并使用 JSONC-safe 解析：保留 comments、trailing commas、未知 settings 和原有 entries，并将当前 source 插入或移动到数组下标 `0`。

Product 声明使用真实业务 Repo 的 `.github/copilot/settings.json`。Team AI 只 read-modify-write 相关 Marketplace/Product 字段，保留无关字段、Marketplace 与 Plugin。

## Ownership 与 Project state

`managedPlugins` 是 ownership 边界。Team AI 只能 install、enable、disable、update 或 repair 自己在 convergence 中明确安装/claim 的 Plugin。用户-owned 和第三方 Plugin 状态保持不动。

真实业务 Git Repo 就是 Project Scope。Project-specific Copilot customization 保留在 `.github/*`；Project 本身不是 Plugin 类型。Machine state 按稳定的 Git project anchor 分区：

```text
~/.team-ai/
  config.yaml
  projects/
    <safe-anchor>-<hash>/
      anchor
      state.json
```

## Marketplace rename 工具

仓库中的 `scripts/rename-marketplace.mjs` 是 Marketplace maintainer utility。它只修改目标 Marketplace Repo 内的逻辑 ID，不修改通用 CLI，也不修改用户机器或业务 Repo 的 state。

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
npm run test:e2e:copilot
npm run test:e2e:fallback
npm test
```

两个 E2E 脚本都会创建隔离的临时 profile 和 Git Repo。`test:e2e:copilot` 验证 native Copilot；`test:e2e:fallback` 验证 VS Code-only materializer，并再检查 materialized state 能被 native Copilot 识别。本分支最新实证见 [`docs/HANDOFF.md`](docs/HANDOFF.md)。

## 当前不做

本项目不实现默认 Marketplace、多 Marketplace merge/overlay/precedence、Package Manager、另一套 Agent Runtime、通用 IDE abstraction、自定义 Plugin/Skill/Hook/MCP 格式、资源复制/injection、通用 overlay engine、telemetry、dashboard、TeamWiki/Recall/Learning，也不创建自定义 Product/Project database。

## 项目文档

- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md)：当前 frozen delta 的实施计划与完成状态。
- [`docs/HANDOFF.md`](docs/HANDOFF.md)：当前实现状态与验证证据。
- [`docs/VERSIONING.md`](docs/VERSIONING.md)：CLI、Marketplace 与 Plugin 的版本规则。
- [`docs/codex-first-review.md`](docs/codex-first-review.md)：实现审查发现与处置状态。
