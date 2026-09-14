import { describe, expect, test } from "vitest";
import { MARKETPLACE_NAME } from "../../src/config/schema.js";
import { desiredUserPlugins } from "../../src/copilot/plugins.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", MARKETPLACE_NAME)).toEqual([
      `common@${MARKETPLACE_NAME}`,
      `role-api@${MARKETPLACE_NAME}`,
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", MARKETPLACE_NAME)).toEqual([
      `common@${MARKETPLACE_NAME}`,
      `role-design@${MARKETPLACE_NAME}`,
    ]);
  });
});
