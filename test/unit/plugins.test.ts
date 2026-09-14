import { describe, expect, test } from "vitest";
import { desiredUserPlugins } from "../../src/copilot/plugins.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", "teamai")).toEqual([
      "common@teamai",
      "role-api@teamai",
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", "teamai")).toEqual([
      "common@teamai",
      "role-design@teamai",
    ]);
  });
});
