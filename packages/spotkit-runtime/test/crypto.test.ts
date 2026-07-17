import { describe, expect, it } from "vitest";

import { seal, unseal } from "../src/index.js";

describe("encrypted values", () => {
  it("round-trips without exposing plaintext", () => {
    const encrypted = seal("super-secret-token", "key", "app:tokens");
    expect(encrypted).not.toContain("super-secret-token");
    expect(unseal(encrypted, "key", "app:tokens")).toBe("super-secret-token");
  });

  it("rejects tampering and context reuse", () => {
    const encrypted = seal("value", "key", "app:tokens");
    const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
    expect(() => unseal(tampered, "key", "app:tokens")).toThrow();
    expect(() => unseal(encrypted, "key", "other:tokens")).toThrow();
  });
});
