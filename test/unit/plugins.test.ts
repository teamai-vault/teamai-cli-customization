import { describe, expect, test } from "vitest";
import { desiredUserPlugins } from "../../src/copilot/plugins.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", "company-ai")).toEqual([
      "common@company-ai",
      "role-api@company-ai",
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", "company-ai")).toEqual([
      "common@company-ai",
      "role-design@company-ai",
    ]);
  });
});
