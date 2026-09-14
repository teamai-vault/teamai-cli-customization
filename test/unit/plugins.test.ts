import { describe, expect, test } from "vitest";
import { desiredUserPlugins } from "../../src/copilot/plugins.js";
import { TEST_MARKETPLACE_NAME } from "../helpers/test-utils.js";

describe("desired plugin resolution", () => {
  test("resolves common plus selected role", () => {
    expect(desiredUserPlugins("api", TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `role-api@${TEST_MARKETPLACE_NAME}`,
    ]);
  });

  test("supports the design role", () => {
    expect(desiredUserPlugins("design", TEST_MARKETPLACE_NAME)).toEqual([
      `common@${TEST_MARKETPLACE_NAME}`,
      `role-design@${TEST_MARKETPLACE_NAME}`,
    ]);
  });
});
