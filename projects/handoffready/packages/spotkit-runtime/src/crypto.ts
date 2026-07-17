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
  return safeEqual(sign(value, secret), signature);
}

export function safeEqual(left: string, right: string): boolean {
  const expected = Buffer.from(left);
  const actual = Buffer.from(right);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function seal(value: string, secret: string, context: string): string {
  const key = deriveKey(secret, context);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function unseal(value: string, secret: string, context: string): string {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error("Encrypted value is malformed.");
  }
  const [iv, tag, encrypted] = parts as [string, string, string];
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret, context),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function deriveKey(secret: string, context: string): Buffer {
  return createHmac("sha256", secret)
    .update(`spotkit-runtime:${context}`)
    .digest();
}
