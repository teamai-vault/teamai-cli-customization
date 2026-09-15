import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import { selectRole } from "../../src/utils/prompt.js";

describe("role picker", () => {
  test("moves with arrow keys and selects one role", async () => {
    const input = new PassThrough() as unknown as NodeJS.ReadStream;
    const output = new PassThrough() as unknown as NodeJS.WriteStream;
    Object.assign(input, {
      isRaw: false,
      setRawMode(raw: boolean) { this.isRaw = raw; return this; },
    });
    const selected = selectRole(["api", "ios", "qa"], input, output);
    input.write("\x1b[B\r");
    await expect(selected).resolves.toBe("ios");
  });
});
