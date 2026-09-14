import { describe, expect, test } from "vitest";
import { normalizeAnchor, partitionSlug } from "../../src/project/partition.js";

describe("machine partition", () => {
  test("normalizes Windows drive paths case-insensitively", () => {
    expect(normalizeAnchor("C:\\Work\\Payment-Api\\", "win32")).toBe("c:/work/payment-api");
    expect(partitionSlug("C:\\Work\\Payment-Api", "win32")).toBe(partitionSlug("c:\\work\\payment-api", "win32"));
  });

  test("uses a hash to avoid safe-name collisions", () => {
    expect(partitionSlug("C:\\a:b", "win32")).not.toBe(partitionSlug("C:\\a?b", "win32"));
  });

  test("preserves POSIX case semantics for macOS-style paths", () => {
    expect(normalizeAnchor("/Users/Alice/Work/Payment-Api/", "darwin")).toBe("/Users/Alice/Work/Payment-Api");
    expect(partitionSlug("/Users/Alice/Work/Payment-Api", "darwin")).not.toBe(
      partitionSlug("/Users/alice/Work/Payment-Api", "darwin"),
    );
  });
});
