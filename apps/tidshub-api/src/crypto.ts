import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function verifySignature(
  value: string,
  signature: string,
  secret: string,
): boolean {
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function seal(value: string, secret: string): string {
  const key = createHmac("sha256", secret)
    .update("tidshub-token-store")
    .digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function unseal(value: string, secret: string): string {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Stored installation is malformed.");
  }
  const [ivValue, tagValue, encryptedValue] = parts as [string, string, string];
  const key = createHmac("sha256", secret)
    .update("tidshub-token-store")
    .digest();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
