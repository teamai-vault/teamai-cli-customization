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
- Evidence: the validator resolved catalog `source` values without checking the resulting path boundary. A `../outside-plugin` fixture received a clean validation result.
- Disposition: Fixed. Local Plugin sources must resolve inside the Marketplace repository; a focused boundary test remains.

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

## No change recommended

- P1.1 MCP: no reviewed shared MCP use case or credential owner exists yet.
- P1.2 Hooks: no reviewed automatic lifecycle action exists yet.
- Example Common and Role content: no production content owners were identified.

Adding placeholders for these items would increase execution and governance surface without delivering a real capability.
