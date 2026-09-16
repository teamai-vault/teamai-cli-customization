import { constants } from "node:fs";
import { access, lstat, mkdir, open, readdir, realpath, unlink } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "../utils/fs.js";

const INSTRUCTION_SUFFIX = ".instructions.md";

export interface ManagedUserInstruction {
  relativePath: string;
  content: Buffer;
}

export interface UserInstructionTestHooks {
  beforeSourceFileOpen?: (filePath: string) => Promise<void> | void;
  beforeTargetFileOpen?: (filePath: string) => Promise<void> | void;
  beforeTargetChange?: (filePath: string) => Promise<void> | void;
  afterTargetDirectoryOpened?: (filePath: string) => Promise<void> | void;
  afterTargetRootResolved?: (targetRoot: string) => Promise<void> | void;
}

export type UserInstructionChange =
  | { type: "create"; relativePath: string }
  | { type: "update"; relativePath: string }
  | { type: "remove"; relativePath: string };

export interface UserInstructionPlan {
  targetRoot: string;
  desired: ManagedUserInstruction[];
  changes: UserInstructionChange[];
  installed: Map<string, InstalledUserInstruction>;
}

export interface UserInstructionState {
  desiredCount: number;
  changes: UserInstructionChange[];
  current: boolean;
  targetWritable: boolean;
}

export function userInstructionTargetRoot(homeDir: string): string {
  return path.join(homeDir, ".copilot", "instructions", "team-ai");
}

export function userInstructionDisplayPath(relativePath: string): string {
  return `~/.copilot/instructions/team-ai/${relativePath}`;
}

export async function discoverMarketplaceUserInstructions(
  marketplaceRoot: string,
  options: { hooks?: UserInstructionTestHooks } = {},
): Promise<ManagedUserInstruction[]> {
  const sourceRoot = path.resolve(marketplaceRoot, "user-instructions");
  let sourceStat;
  try {
    sourceStat = await lstat(sourceRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw sourceReadError(sourceRoot, error);
  }
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink() || await isLinkLike(sourceRoot, sourceStat)) {
    throw unsafeSourceError(sourceRoot);
  }
  const resolvedSourceRoot = await resolveDirectoryIdentity(sourceRoot, sourceStat, unsafeSourceError);

  const discovered: ManagedUserInstruction[] = [];
  await walkSource(resolvedSourceRoot, resolvedSourceRoot, discovered, options.hooks);
  discovered.sort((left, right) => comparePaths(left.relativePath, right.relativePath));
  return discovered;
}

export async function planUserInstructionChanges(
  desired: ManagedUserInstruction[],
  targetRoot: string,
  options: { hooks?: UserInstructionTestHooks } = {},
): Promise<UserInstructionPlan> {
  const normalizedTargetRoot = path.resolve(targetRoot);
  const desiredByPath = new Map<string, ManagedUserInstruction>();
  for (const instruction of desired) {
    assertSafeRelativePath(instruction.relativePath);
    const relativePath = toPortableRelativePath(instruction.relativePath);
    if (desiredByPath.has(relativePath)) {
      throw new Error(`Duplicate Marketplace user instruction path '${relativePath}'.`);
    }
    desiredByPath.set(relativePath, { ...instruction, relativePath });
  }

  const installed = await readInstalledInstructions(normalizedTargetRoot, options.hooks);
  const changes: UserInstructionChange[] = [];
  for (const instruction of [...desiredByPath.values()].sort((left, right) => comparePaths(left.relativePath, right.relativePath))) {
    const existing = installed.get(instruction.relativePath);
    if (!existing) {
      changes.push({ type: "create", relativePath: instruction.relativePath });
    } else if (!existing.content.equals(instruction.content)) {
      changes.push({ type: "update", relativePath: instruction.relativePath });
    }
  }
  for (const relativePath of [...installed.keys()].sort(comparePaths)) {
    if (!desiredByPath.has(relativePath)) changes.push({ type: "remove", relativePath });
  }
  return { targetRoot: normalizedTargetRoot, desired: [...desiredByPath.values()], changes, installed };
}

export async function applyUserInstructionChanges(
  plan: UserInstructionPlan,
  options: { dryRun?: boolean; hooks?: UserInstructionTestHooks } = {},
): Promise<void> {
  if (options.dryRun || plan.changes.length === 0) return;
  const resolvedTargetRoot = await ensureTargetRoot(plan.targetRoot, true);
  await options.hooks?.afterTargetRootResolved?.(resolvedTargetRoot);
  const desired = new Map(plan.desired.map((instruction) => [instruction.relativePath, instruction]));
  for (const change of plan.changes) {
    const targetPath = safeTargetPath(resolvedTargetRoot, change.relativePath);
    await options.hooks?.beforeTargetChange?.(targetPath);
    const parent = await openStableTargetDirectory(path.dirname(targetPath));
    try {
      await options.hooks?.afterTargetDirectoryOpened?.(targetPath);
      await assertStableTargetDirectory(path.dirname(targetPath), parent);
      const operationPath = await directoryOperationPath(parent, targetPath);
      await assertPlannedTargetEntry(
        operationPath,
        plan.installed.get(change.relativePath)?.identity,
        change.type === "create",
        operationPath === targetPath,
      );
      if (change.type === "remove") {
        await unlink(operationPath).catch((error) => {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        });
        continue;
      }
      const instruction = desired.get(change.relativePath);
      if (!instruction) throw new Error(`Missing desired Marketplace user instruction '${change.relativePath}'.`);
      await atomicWriteFile(operationPath, instruction.content);
    } finally {
      await parent.close();
    }
  }
}

export async function convergeMarketplaceUserInstructions(
  marketplaceRoot: string,
  homeDir: string,
  options: { dryRun?: boolean; hooks?: UserInstructionTestHooks } = {},
): Promise<UserInstructionPlan> {
  const desired = await discoverMarketplaceUserInstructions(marketplaceRoot, options);
  const plan = await planUserInstructionChanges(desired, userInstructionTargetRoot(homeDir), options);
  await applyUserInstructionChanges(plan, options);
  return plan;
}

export async function checkUserInstructionState(
  desired: ManagedUserInstruction[],
  targetRoot: string,
): Promise<UserInstructionState> {
  const plan = await planUserInstructionChanges(desired, targetRoot);
  return {
    desiredCount: desired.length,
    changes: plan.changes,
    current: plan.changes.length === 0,
    targetWritable: plan.changes.length === 0 || await plannedChangesAreWritable(plan),
  };
}

interface FileIdentity {
  dev: number;
  ino: number;
}

interface InstalledUserInstruction {
  content: Buffer;
  identity: FileIdentity;
}

async function resolveDirectoryIdentity(
  directory: string,
  expected: { isDirectory(): boolean; dev: number; ino: number },
  unsafeError: (filePath: string) => Error,
): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(directory);
  } catch {
    throw unsafeError(directory);
  }
  if (!samePath(directory, resolved)) throw unsafeError(directory);
  let actual;
  try {
    actual = await lstat(resolved);
  } catch {
    throw unsafeError(directory);
  }
  if (!actual.isDirectory() || !sameObjectIdentity(expected, actual)) throw unsafeError(directory);
  return resolved;
}

async function readCheckedFile(
  filePath: string,
  expected: { isFile(): boolean; nlink: number; dev: number; ino: number },
  unsafeError: (filePath: string) => Error,
  readError: (filePath: string, error: unknown) => Error,
): Promise<Buffer> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | noFollow);
  } catch (error) {
    throw readError(filePath, error);
  }
  try {
    let actual;
    try {
      actual = await handle.stat();
    } catch (error) {
      throw readError(filePath, error);
    }
    if (!actual.isFile() || actual.nlink !== 1 || !sameObjectIdentity(expected, actual)) {
      throw unsafeError(filePath);
    }
    try {
      return await handle.readFile();
    } catch (error) {
      throw readError(filePath, error);
    }
  } finally {
    await handle.close();
  }
}

async function assertPlannedTargetEntry(
  targetPath: string,
  expected: FileIdentity | undefined,
  allowMissing: boolean,
  checkPathLinks = true,
): Promise<void> {
  let info;
  try {
    info = await lstat(targetPath);
  } catch (error) {
    if (allowMissing && (error as NodeJS.ErrnoException).code === "ENOENT") return;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw unsafeTargetError(targetPath);
    throw error;
  }
  if (allowMissing || !expected || !info.isFile() || info.nlink !== 1 || (checkPathLinks && await isLinkLike(targetPath, info)) || !sameObjectIdentity(expected, info)) {
    throw unsafeTargetError(targetPath);
  }
}

async function openStableTargetDirectory(directory: string): Promise<FileHandle> {
  await ensureSafeTargetChain(directory);
  let expected;
  try {
    expected = await lstat(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    try {
      await mkdir(directory, { recursive: true });
    } catch (mkdirError) {
      if (["EEXIST", "ENOTDIR", "ELOOP"].includes((mkdirError as NodeJS.ErrnoException).code ?? "")) {
        throw unsafeTargetError(directory);
      }
      throw mkdirError;
    }
    await ensureSafeTargetChain(directory);
    expected = await lstat(directory);
  }
  if (!expected.isDirectory() || await isLinkLike(directory, expected)) throw unsafeTargetError(directory);

  let handle: FileHandle;
  try {
    const directoryFlag = typeof constants.O_DIRECTORY === "number" ? constants.O_DIRECTORY : 0;
    handle = await open(directory, constants.O_RDONLY | directoryFlag);
  } catch (error) {
    throw new Error(`Could not open managed user instruction target '${directory}': ${(error as Error).message}`);
  }
  try {
    const actual = await handle.stat();
    if (!actual.isDirectory() || !sameObjectIdentity(expected, actual) || await isLinkLike(directory, expected)) {
      throw unsafeTargetError(directory);
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertStableTargetDirectory(directory: string, handle: FileHandle): Promise<void> {
  let current;
  try {
    current = await lstat(directory);
  } catch {
    throw unsafeTargetError(directory);
  }
  if (!current.isDirectory() || await isLinkLike(directory, current)) throw unsafeTargetError(directory);
  const opened = await handle.stat();
  if (!opened.isDirectory() || !sameObjectIdentity(current, opened)) throw unsafeTargetError(directory);
}

async function directoryOperationPath(handle: FileHandle, targetPath: string): Promise<string> {
  if (process.platform === "win32") {
    // ponytail: win32 Node has no openat/renameat or handle-relative rename; retain identity/reparse checks and use the path fallback until a native helper is justified.
    return targetPath;
  }
  const descriptorRoot = process.platform === "darwin" ? "/dev/fd" : "/proc/self/fd";
  const descriptorPath = path.join(descriptorRoot, String(handle.fd));
  try {
    await access(descriptorPath);
    return path.join(descriptorPath, path.basename(targetPath));
  } catch {
    return targetPath;
  }
}

function fileIdentity(info: { dev: number; ino: number }): FileIdentity {
  return { dev: info.dev, ino: info.ino };
}

function sameObjectIdentity(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

async function walkSource(
  directory: string,
  root: string,
  result: ManagedUserInstruction[],
  hooks?: UserInstructionTestHooks,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw sourceReadError(directory, error);
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    let entryStat;
    try {
      entryStat = await lstat(entryPath);
    } catch (error) {
      throw sourceReadError(entryPath, error);
    }
    if (await isLinkLike(entryPath, entryStat)) continue;
    if (entryStat.isDirectory()) {
      const resolvedDirectory = await resolveDirectoryIdentity(entryPath, entryStat, unsafeSourceError);
      await walkSource(resolvedDirectory, root, result, hooks);
      continue;
    }
    if (!entryStat.isFile() || entryStat.nlink !== 1 || !entry.name.endsWith(INSTRUCTION_SUFFIX)) continue;
    await hooks?.beforeSourceFileOpen?.(entryPath);
    const content = await readCheckedFile(entryPath, entryStat, unsafeSourceError, sourceReadError);
    result.push({
      relativePath: toPortableRelativePath(path.relative(root, entryPath)),
      content,
    });
  }
}

async function readInstalledInstructions(
  targetRoot: string,
  hooks?: UserInstructionTestHooks,
): Promise<Map<string, InstalledUserInstruction>> {
  try {
    const resolvedTargetRoot = await ensureTargetRoot(targetRoot, false);
    const installed = new Map<string, InstalledUserInstruction>();
    await walkTarget(resolvedTargetRoot, resolvedTargetRoot, installed, hooks);
    return installed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map<string, InstalledUserInstruction>();
    throw error;
  }
}

async function walkTarget(
  directory: string,
  root: string,
  result: Map<string, InstalledUserInstruction>,
  hooks?: UserInstructionTestHooks,
): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Could not read managed user instruction target '${directory}': ${(error as Error).message}`);
  }
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    let entryStat;
    try {
      entryStat = await lstat(entryPath);
    } catch (error) {
      throw new Error(`Could not read managed user instruction target '${entryPath}': ${(error as Error).message}`);
    }
    if (await isLinkLike(entryPath, entryStat)) throw unsafeTargetError(entryPath);
    if (entryStat.isDirectory()) {
      if (entry.name.endsWith(INSTRUCTION_SUFFIX)) throw unsafeTargetError(entryPath);
      const resolvedDirectory = await resolveDirectoryIdentity(entryPath, entryStat, unsafeTargetError);
      await walkTarget(resolvedDirectory, root, result, hooks);
      continue;
    }
    if (!entry.name.endsWith(INSTRUCTION_SUFFIX)) continue;
    if (!entryStat.isFile() || entryStat.nlink !== 1) throw unsafeTargetError(entryPath);
    await hooks?.beforeTargetFileOpen?.(entryPath);
    result.set(toPortableRelativePath(path.relative(root, entryPath)), {
      content: await readCheckedFile(entryPath, entryStat, unsafeTargetError, (filePath, error) =>
        new Error(`Could not read managed user instruction target '${filePath}': ${(error as Error).message}`)),
      identity: fileIdentity(entryStat),
    });
  }
}

async function ensureTargetRoot(targetRoot: string, create: boolean): Promise<string> {
  await ensureSafeTargetChain(targetRoot);
  try {
    const info = await lstat(targetRoot);
    if (await isLinkLike(targetRoot, info) || !info.isDirectory()) throw unsafeTargetError(targetRoot);
    return await resolveDirectoryIdentity(targetRoot, info, unsafeTargetError);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT" || !create) throw error;
  }
  await mkdir(targetRoot, { recursive: true });
  await ensureSafeTargetChain(targetRoot);
  const info = await lstat(targetRoot);
  if (await isLinkLike(targetRoot, info) || !info.isDirectory()) throw unsafeTargetError(targetRoot);
  return await resolveDirectoryIdentity(targetRoot, info, unsafeTargetError);
}

async function ensureSafeTargetChain(targetRoot: string): Promise<void> {
  let current = path.resolve(targetRoot);
  while (true) {
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const parent = path.dirname(current);
        if (parent === current) return;
        current = parent;
        continue;
      }
      throw error;
    }
    if (await isLinkLike(current, info) || !info.isDirectory()) throw unsafeTargetError(current);
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

async function plannedChangesAreWritable(plan: UserInstructionPlan): Promise<boolean> {
  for (const change of plan.changes) {
    const targetPath = safeTargetPath(plan.targetRoot, change.relativePath);
    if (!await operationDirectoryIsWritable(path.dirname(targetPath))) return false;
  }
  return true;
}

async function operationDirectoryIsWritable(directory: string): Promise<boolean> {
  let current = path.resolve(directory);
  while (true) {
    try {
      const info = await lstat(current);
      if (await isLinkLike(current, info) || !info.isDirectory()) return false;
      await access(current, constants.W_OK);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return false;
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
    }
  }
}

function safeTargetPath(targetRoot: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  const root = path.resolve(targetRoot);
  const target = path.resolve(root, ...relativePath.split(/[\\/]+/));
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Unsafe Marketplace user instruction destination '${relativePath}'.`);
  }
  return target;
}

function assertSafeRelativePath(relativePath: string): void {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    path.posix.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    /^[A-Za-z]:/.test(relativePath) ||
    relativePath.split(/[\\/]+/).some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
    !relativePath.endsWith(INSTRUCTION_SUFFIX)
  ) {
    throw new Error(`Unsafe Marketplace user instruction destination '${relativePath}'.`);
  }
}

function toPortableRelativePath(relativePath: string): string {
  return relativePath.split(/[\\/]+/).join("/");
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function isLinkLike(filePath: string, info: { isSymbolicLink(): boolean }): Promise<boolean> {
  if (info.isSymbolicLink()) return true;
  try {
    return !samePath(filePath, await realpath(filePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.normalize(path.resolve(left));
  const normalizedRight = path.normalize(path.resolve(right));
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function sourceReadError(filePath: string, error: unknown): Error {
  return new Error(`Could not read Marketplace user instructions at '${filePath}': ${(error as Error).message}`);
}

function unsafeSourceError(filePath: string): Error {
  return new Error(`Unsafe Marketplace user instructions source '${filePath}'.`);
}

function unsafeTargetError(filePath: string): Error {
  return new Error(`Unsafe managed user instruction target '${filePath}'.`);
}
