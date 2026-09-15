# Codex First Review

> Review date: 2026-09-15
> Baseline: `main` at `d7802b5` for the CLI and `60ff5e4` for the Marketplace

This review covers the current source, tests, READMEs, Git state, recent history, `HANDOFF.md`, and `IMPLEMENTATION-PLAN.md` in both repositories. Findings are recorded here even when fixed during the same implementation.

## Findings

### CFR-01 — Product validation happened after Copilot mutation

- Severity: High
- Repository: `teamai-cli-customization`
- Evidence: `initCommand` converged Common and Role plugins before checking whether the requested Product Plugin existed. The focused RED test showed that a rejected Product left a registered Marketplace plus enabled Common and Role plugins while no ownership config was written.
- Disposition: Fixed. Product existence is now a convergence precondition; a Marketplace added only for validation is removed when validation fails, before Plugin mutation.

### CFR-02 — Matching user-owned plugins produced no ownership warning

- Severity: Medium
- Repository: `teamai-cli-customization`
- Evidence: `convergeUserPlugins` warned only when a user-owned desired Plugin was disabled or version-mismatched. A matching enabled Plugin remained unclaimed as intended, but ownership was silent despite the Handoff rule.
- Disposition: Fixed. Every desired non-live Plugin outside `managedPlugins` remains untouched and emits the same ownership warning.

### CFR-03 — Marketplace validation accepted repository-escaping Plugin sources

- Severity: Medium
- Repository: `teamai-marketplace`
- Evidence: the validator first accepted `../outside-plugin`; its initial lexical boundary fix could then be bypassed by an in-repository junction or symlink targeting an external directory. A later review also found that links in `plugin.json`, `skills/`, or `SKILL.md` could escape an otherwise valid Plugin root.
- Disposition: Fixed. Local Plugin sources and the capability files read from them must remain inside their canonical ownership boundaries; focused traversal, Plugin-root link, and internal-content link tests remain.

### CFR-04 — Doctor treated an empty readable catalog as unavailable

- Severity: Medium
- Repository: `teamai-cli-customization`
- Evidence: Product declaration validation was guarded by `marketplaceCatalog.length > 0`. A successful empty catalog therefore allowed a missing declared Product to pass `doctor` with exit code 0.
- Disposition: Fixed. Catalog availability is now distinct from catalog length, and an empty readable catalog rejects every declared Team AI Product.

### CFR-05 — CLI accepts unknown or trailing arguments

- Severity: Low
- Repository: `teamai-cli-customization`
- Evidence: command dispatch reads recognized positions and options but does not reject remaining arguments. Inputs such as a valid command followed by an unknown flag can still execute.
- Disposition: Deferred. Add strict argument consumption when the command surface grows or incorrect automation input is observed; avoid introducing a parser dependency for the current small surface.

### CFR-06 — Failed atomic writes may leave temporary files

- Severity: Low
- Repository: `teamai-cli-customization`
- Evidence: `atomicWriteText` closes the temporary file on write failure but removes it only through a successful rename. A failed write or rename can leave a sibling `.tmp` file.
- Disposition: Deferred. Add best-effort cleanup in the error path when filesystem-failure testing is introduced.

### CFR-07 — Unused filesystem helper

- Severity: Low optimization
- Repository: `teamai-cli-customization`
- Evidence: `pathExists` is exported but has no callers.
- Disposition: Deferred to a cleanup-only change; it does not affect runtime behavior.

### CFR-08 — Malformed Marketplace JSON fails with a raw parse exception

- Severity: Low
- Repository: `teamai-marketplace`
- Evidence: the validator aggregates structural errors after parsing, but malformed Marketplace or Plugin JSON escapes as an exception rather than a repository-scoped validation message.
- Disposition: Deferred. Improve when multiple invalid-file diagnostics are needed; current CI still fails loud and cannot report false green.

### CFR-09 — macOS tests compared canonical and symlinked temp paths

- Severity: Medium test defect
- Repository: `teamai-cli-customization`
- Evidence: the first real macOS CI run returned canonical `/private/var/...` project identities while test fixtures retained `/var/...`, causing three false failures.
- Disposition: Fixed. The shared temporary-directory helper now returns its canonical real path, matching the production project-identity boundary.

### CFR-10 — Marketplace test script relied on shell glob expansion

- Severity: Medium portability defect
- Repository: `teamai-marketplace`
- Evidence: the first Windows CI run passed the literal `test/*.test.mjs` to Node 20, which could not find that path.
- Disposition: Fixed. The test script now uses Node's built-in test discovery without a shell glob.

### CFR-11 — Initial workflow actions used the deprecated Node 20 action runtime

- Severity: Low maintenance defect
- Repositories: both
- Evidence: the first successful branch runs emitted deprecation annotations for `actions/checkout@v4` and `actions/setup-node@v4`, with GitHub forcing their action runtime to Node 24.
- Disposition: Fixed. Both workflows now use the current Node 24-based v7 major releases.

### CFR-12 — Skill validation omitted required capability description

- Severity: Medium
- Repository: `teamai-marketplace`
- Evidence: a Skill with a matching frontmatter `name` but no `description` passed validation.
- Disposition: Fixed. The validator now requires a non-empty frontmatter description, with a focused negative test.

### CFR-13 — Real smoke initialization could bypass temporary-state cleanup

- Severity: Low reliability defect
- Repositories: both
- Evidence: temporary profiles and directory initialization happened before the `try/finally`; an initialization failure could therefore leave isolated test state behind.
- Disposition: Fixed. Creation and initialization now occur inside the cleanup boundary, guarded for the case where temporary-root creation itself fails.

### CFR-14 — Convergence exposed an unused full catalog result

- Severity: Low optimization
- Repository: `teamai-cli-customization`
- Evidence: `ConvergeResult` returned the full Marketplace catalog although `init` only needed to know whether it was available.
- Disposition: Fixed. The result now exposes the minimal `catalogAvailable` boolean.

### CFR-15 — Product validation followed Plugin inspection

- Severity: Medium
- Repository: `teamai-cli-customization`
- Evidence: after temporarily registering a Marketplace, convergence called `listPlugins` before checking the required Product catalog. A structured Plugin-list failure could therefore interrupt the Product precondition and leave the temporary registration behind.
- Disposition: Fixed. Required Product availability is now checked and failure cleanup completes before Plugin listing or mutation; a focused ordering test remains.

### CFR-16 — Native MCP metadata was available but Team AI did not inspect it

- Severity: Medium capability gap
- Repository: `teamai-cli-customization`
- Evidence: Copilot CLI `1.0.83` supports `copilot plugins list --kind mcp --json`, including non-empty user-scoped MCP rows, while `status` and `doctor` only inspected Plugin rows.
- Disposition: Fixed. The Copilot client now uses the verified plural structured command; `status` lists native MCP names and `doctor` fails on structured inspection errors without starting servers.

### CFR-17 — Marketplace validation ignored native MCP and Hook declarations

- Severity: High governance gap
- Repository: `teamai-marketplace`
- Evidence: optional root `mcp.json` and `com.github.copilot/hooks/hooks.json` files were not read, so escaped/missing sources, unsafe command shapes, non-HTTPS endpoints, committed credential headers, and hidden download/execute commands could pass CI.
- Disposition: Fixed. The validator now checks the native declaration locations with synthetic safe/unsafe fixtures. It does not execute either capability type, and no production Plugin instance was added.

### CFR-18 — Copilot CLI does not expose structured Plugin Hook inspection

- Severity: Medium platform limitation
- Repository: `teamai-cli-customization`
- Evidence: Copilot CLI `1.0.83` documents in `copilot plugins list --help` that custom agents and session-scoped Hooks are not covered because they require a live session.
- Disposition: Accepted and surfaced. `status` and `doctor` report declaration-only support/runtime inspection unavailability; Team AI does not execute Hooks to simulate a health check.

## No change recommended

- Example Common and Role content: no production content owners were identified.

No production MCP server or Hook implementation is recommended until its use case and security owner exist. Capability support is covered by validation, diagnostics, and synthetic fixtures rather than placeholders.
