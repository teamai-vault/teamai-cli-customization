import { cp, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "EISDIR") {
      return false;
    }
    throw error;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readJsonIfExists<T>(filePath: string): Promise<T | undefined> {
  const contents = await readTextIfExists(filePath);
  return contents === undefined ? undefined : (JSON.parse(contents) as T);
}

export async function atomicWriteText(filePath: string, contents: string): Promise<void> {
  await atomicWriteFile(filePath, Buffer.from(contents, "utf8"));
}

export async function atomicWriteFile(filePath: string, contents: Uint8Array): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await open(tempPath, "wx").then(async (handle) => {
      try {
        await handle.writeFile(contents);
        await handle.sync();
      } finally {
        await handle.close();
      }
    });
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function replaceDirectory(source: string, target: string): Promise<void> {
  const parent = path.dirname(target);
  const suffix = `${process.pid}.${Date.now()}`;
  const temporary = path.join(parent, `.${path.basename(target)}.${suffix}.tmp`);
  const backup = path.join(parent, `.${path.basename(target)}.${suffix}.bak`);
  await mkdir(parent, { recursive: true });
  await cp(source, temporary, { recursive: true, errorOnExist: true, verbatimSymlinks: true });
  let hadTarget = false;
  try {
    await rename(target, backup);
    hadTarget = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    await rename(temporary, target);
    if (hadTarget) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (hadTarget) await rename(backup, target);
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

export async function withFileLock<T>(lockPath: string, action: () => Promise<T>): Promise<T> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = await open(lockPath, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Another Team AI operation is already using ${lockPath}`);
    }
    throw error;
  }

  try {
    return await action();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
