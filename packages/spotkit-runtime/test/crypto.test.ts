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
    const parts = encrypted.split(".");
    const ciphertext = parts[2]!;
    parts[2] = `${ciphertext.startsWith("A") ? "B" : "A"}${ciphertext.slice(1)}`;
    const tampered = parts.join(".");
    expect(() => unseal(tampered, "key", "app:tokens")).toThrow();
    expect(() => unseal(encrypted, "key", "other:tokens")).toThrow();
  });
});
