import { describe, expect, it } from "vitest";
import { CORE_VERSION } from "@sharepay/core";

describe("workspace scaffold", () => {
  it("resolves the @sharepay/core workspace package", () => {
    expect(CORE_VERSION).toBe("0.1.0");
  });
});
