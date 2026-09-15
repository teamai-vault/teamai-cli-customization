import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  applyUserInstructionChanges,
  discoverMarketplaceUserInstructions,
  planUserInstructionChanges,
  userInstructionTargetRoot,
} from "../../src/copilot/user-instructions.js";
import { tempDir } from "../helpers/test-utils.js";

describe("Marketplace-managed user instructions", () => {
  test("discovers nested instruction files in deterministic order and ignores other files", async () => {
    const marketplace = await tempDir("team-ai-instructions-source-");
    await mkdir(path.join(marketplace, "user-instructions", "git"), { recursive: true });
    await writeFile(path.join(marketplace, "user-instructions", "README.md"), "ignore\n", "utf8");
    await writeFile(path.join(marketplace, "user-instructions", "git", "pull.instructions.md"), "pull\r\n", "utf8");
    await writeFile(path.join(marketplace, "user-instructions", "global.instructions.md"), Buffer.from([0x67, 0x6c, 0x6f, 0x62, 0x61, 0x6c, 0x00]));

    const instructions = await discoverMarketplaceUserInstructions(marketplace);

    expect(instructions.map((item) => item.relativePath)).toEqual([
      "git/pull.instructions.md",
      "global.instructions.md",
    ]);
    expect(instructions[0].content).toEqual(Buffer.from("pull\r\n"));
    expect(instructions[1].content).toEqual(Buffer.from([0x67, 0x6c, 0x6f, 0x62, 0x61, 0x6c, 0x00]));
  });

  test("treats a missing source directory as an empty desired state", async () => {
    const marketplace = await tempDir("team-ai-instructions-missing-source-");

    await expect(discoverMarketplaceUserInstructions(marketplace)).resolves.toEqual([]);
  });

  test.skipIf(process.platform === "win32")("does not follow source symlinks", async () => {
    const marketplace = await tempDir("team-ai-instructions-link-source-");
    const external = await tempDir("team-ai-instructions-link-external-");
    await mkdir(path.join(marketplace, "user-instructions"), { recursive: true });
    await writeFile(path.join(external, "outside.instructions.md"), "outside\n", "utf8");
    await symlink(path.join(external, "outside.instructions.md"), path.join(marketplace, "user-instructions", "outside.instructions.md"));

    await expect(discoverMarketplaceUserInstructions(marketplace)).resolves.toEqual([]);
  });

  test("plans and applies byte-preserving create, update, and remove changes", async () => {
    const marketplace = await tempDir("team-ai-instructions-plan-");
    const home = await tempDir("team-ai-instructions-home-");
    const sourceDir = path.join(marketplace, "user-instructions");
    const targetRoot = userInstructionTargetRoot(home);
    await mkdir(path.join(sourceDir, "git"), { recursive: true });
    await writeFile(path.join(sourceDir, "git", "commit.instructions.md"), Buffer.from([0x63, 0x72, 0x6c, 0x66, 0x0d, 0x0a]));
    await writeFile(path.join(sourceDir, "global.instructions.md"), "new\n", "utf8");
    await mkdir(path.join(targetRoot, "old"), { recursive: true });
    await writeFile(path.join(targetRoot, "old", "gone.instructions.md"), "remove me\n", "utf8");
    await writeFile(path.join(targetRoot, "global.instructions.md"), "old\n", "utf8");
    await writeFile(path.join(targetRoot, "personal.txt"), "leave me\n", "utf8");

    const desired = await discoverMarketplaceUserInstructions(marketplace);
    const plan = await planUserInstructionChanges(desired, targetRoot);

    expect(plan.changes).toEqual([
      { type: "create", relativePath: "git/commit.instructions.md" },
      { type: "update", relativePath: "global.instructions.md" },
      { type: "remove", relativePath: "old/gone.instructions.md" },
    ]);

    await applyUserInstructionChanges(plan);

    expect(await readFile(path.join(targetRoot, "git", "commit.instructions.md"))).toEqual(Buffer.from([0x63, 0x72, 0x6c, 0x66, 0x0d, 0x0a]));
    expect(await readFile(path.join(targetRoot, "global.instructions.md"), "utf8")).toBe("new\n");
    await expect(readFile(path.join(targetRoot, "old", "gone.instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(targetRoot, "personal.txt"), "utf8")).toBe("leave me\n");
  });

  test("dry-run plans changes without writing", async () => {
    const marketplace = await tempDir("team-ai-instructions-dry-source-");
    const home = await tempDir("team-ai-instructions-dry-home-");
    await mkdir(path.join(marketplace, "user-instructions"), { recursive: true });
    await writeFile(path.join(marketplace, "user-instructions", "global.instructions.md"), "secret body\n", "utf8");

    const plan = await planUserInstructionChanges(
      await discoverMarketplaceUserInstructions(marketplace),
      userInstructionTargetRoot(home),
    );
    await applyUserInstructionChanges(plan, { dryRun: true });

    await expect(readFile(path.join(userInstructionTargetRoot(home), "global.instructions.md"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("rejects unsafe relative destinations", async () => {
    const home = await tempDir("team-ai-instructions-unsafe-home-");

    await expect(planUserInstructionChanges([{
      relativePath: "../outside.instructions.md",
      sourcePath: path.join(home, "source.instructions.md"),
      content: Buffer.from("unsafe"),
    }], userInstructionTargetRoot(home))).rejects.toThrow(/unsafe/i);
  });

  test.skipIf(process.platform === "win32")("rejects a link in the managed target tree", async () => {
    const home = await tempDir("team-ai-instructions-link-target-home-");
    const external = await tempDir("team-ai-instructions-link-target-external-");
    const targetRoot = userInstructionTargetRoot(home);
    await mkdir(targetRoot, { recursive: true });
    await writeFile(path.join(external, "outside.instructions.md"), "outside\n", "utf8");
    await symlink(path.join(external, "outside.instructions.md"), path.join(targetRoot, "outside.instructions.md"));

    await expect(planUserInstructionChanges([], targetRoot)).rejects.toThrow(/unsafe/i);
  });

  test("uses platform-safe target paths for POSIX-style homes", () => {
    expect(userInstructionTargetRoot("/Users/example")).toBe(path.join("/Users/example", ".copilot", "instructions", "team-ai"));
  });

  test("normalizes Windows-style relative paths before planning", async () => {
    const home = await tempDir("team-ai-instructions-windows-path-home-");
    const plan = await planUserInstructionChanges([{
      relativePath: "git\\commit.instructions.md",
      sourcePath: path.join(home, "source.instructions.md"),
      content: Buffer.from("commit\n"),
    }], userInstructionTargetRoot(home));

    expect(plan.changes).toEqual([{ type: "create", relativePath: "git/commit.instructions.md" }]);
  });
});
