export interface SmokeCheck {
  name: string;
  ok: boolean;
  message: string;
}

export interface SmokeReport {
  origin: string;
  ok: boolean;
  checks: SmokeCheck[];
}

export async function smokeApplication(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<SmokeReport> {
  const origin = productionOrigin(value);
  const checks: SmokeCheck[] = [];
  await check(checks, "health", async () => {
    const response = await fetcher(`${origin}/health`);
    const body = (await response.json()) as { ok?: unknown };
    if (!response.ok || body.ok !== true) {
      throw new Error(
        `Expected 200 { ok: true }; received ${response.status}.`,
      );
    }
    return "Health endpoint is ready.";
  });
  await check(checks, "installed-page", async () => {
    const response = await fetcher(`${origin}/installed`);
    const csp = response.headers.get("content-security-policy") ?? "";
    if (!response.ok || !csp.includes("default-src 'none'")) {
      throw new Error("Installed page is missing its locked-down CSP.");
    }
    if (response.headers.get("x-content-type-options") !== "nosniff") {
      throw new Error("Installed page is missing nosniff protection.");
    }
    return "Installed page security headers are present.";
  });
  await check(checks, "oauth-install", async () => {
    const response = await fetcher(`${origin}/oauth/install`, {
      redirect: "manual",
    });
    const location = response.headers.get("location");
    const cookie = response.headers.get("set-cookie") ?? "";
    if (response.status !== 302 || !location) {
      throw new Error(
        `Expected OAuth 302 redirect; received ${response.status}.`,
      );
    }
    const target = new URL(location);
    if (
      target.origin !== "https://app.hubspot.com" ||
      target.pathname !== "/oauth/authorize"
    ) {
      throw new Error(
        "OAuth install does not redirect to HubSpot authorization.",
      );
    }
    if (
      !cookie.includes("HttpOnly") ||
      !cookie.includes("Secure") ||
      !cookie.includes("SameSite=Lax")
    ) {
      throw new Error("OAuth state cookie is missing secure attributes.");
    }
    return "OAuth redirect and state cookie are secure.";
  });
  return { origin, ok: checks.every((item) => item.ok), checks };
}

async function check(
  checks: SmokeCheck[],
  name: string,
  operation: () => Promise<string>,
): Promise<void> {
  try {
    checks.push({ name, ok: true, message: await operation() });
  } catch (cause) {
    checks.push({
      name,
      ok: false,
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function productionOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Smoke target must be an absolute HTTPS origin.");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Smoke target must be an HTTPS origin without a path or query.",
    );
  }
  return url.origin;
}
