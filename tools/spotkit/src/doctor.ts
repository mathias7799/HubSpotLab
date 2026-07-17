import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type DiagnosticLevel = "error" | "warning" | "success";

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  file?: string;
}

export interface DoctorReport {
  root: string;
  diagnostics: Diagnostic[];
  errors: number;
  warnings: number;
  ok: boolean;
}

export async function diagnoseProject(directory = "."): Promise<DoctorReport> {
  const root = path.resolve(directory);
  const diagnostics: Diagnostic[] = [];
  const requiredFiles = [
    "package.json",
    "apps/hubspot/hsproject.json",
    "apps/hubspot/src/app/app-hsmeta.json",
    "services/api/.env.example",
  ];
  for (const file of requiredFiles) {
    if (!(await exists(path.join(root, file)))) {
      diagnostics.push({
        level: "error",
        code: "missing-file",
        message: `Required file is missing: ${file}`,
        file,
      });
    }
  }
  if (!(await findUp(root, "pnpm-workspace.yaml"))) {
    diagnostics.push({
      level: "error",
      code: "workspace",
      message:
        "No pnpm-workspace.yaml was found in this project or its parents.",
    });
  }

  await inspectHubSpotProject(root, diagnostics);
  await inspectAppMetadata(root, diagnostics);
  await inspectBackendOrigins(root, diagnostics);
  await inspectEnvironment(root, diagnostics);
  await inspectExtensionComponents(root, diagnostics);

  const errors = diagnostics.filter((item) => item.level === "error").length;
  const warnings = diagnostics.filter(
    (item) => item.level === "warning",
  ).length;
  if (errors === 0) {
    diagnostics.unshift({
      level: "success",
      code: "project-shape",
      message: "SpotKit project structure is valid.",
    });
  }
  return { root, diagnostics, errors, warnings, ok: errors === 0 };
}

async function inspectBackendOrigins(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const appFile = "apps/hubspot/src/app/app-hsmeta.json";
  const document = await jsonFile(
    path.join(root, appFile),
    diagnostics,
    appFile,
  );
  const fetchUrls = stringArray(
    objectValue(objectValue(document?.config)?.permittedUrls)?.fetch,
  );
  const directory = path.join(root, "apps/hubspot/src/app");
  if (!document || !(await exists(directory))) return;
  const backendFiles = (await walk(directory)).filter((file) =>
    file.endsWith("backend.ts"),
  );
  const seen = new Set<string>();
  for (const absolute of backendFiles) {
    const content = await readFile(absolute, "utf8");
    for (const match of content.matchAll(/https:\/\/[^"'\s;]+/g)) {
      const parsed = safeUrl(match[0]);
      if (!parsed) continue;
      seen.add(parsed.origin);
      if (!fetchUrls.includes(parsed.origin)) {
        diagnostics.push({
          level: "error",
          code: "backend-origin",
          message: `Backend origin ${parsed.origin} is not listed in permittedUrls.fetch.`,
          file: path.relative(root, absolute),
        });
      }
    }
  }
  if (seen.size > 1) {
    diagnostics.push({
      level: "warning",
      code: "multiple-backend-origins",
      message: `Extension backend constants use multiple origins: ${[...seen].join(", ")}.`,
    });
  }
}

async function inspectHubSpotProject(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const file = "apps/hubspot/hsproject.json";
  const document = await jsonFile(path.join(root, file), diagnostics, file);
  if (!document) return;
  if (typeof document.name !== "string" || !document.name.trim()) {
    diagnostics.push({
      level: "error",
      code: "hubspot-project-name",
      message: "hsproject.json must define a project name.",
      file,
    });
  }
  if (document.platformVersion !== "2026.03") {
    diagnostics.push({
      level: "warning",
      code: "platform-version",
      message: `Expected HubSpot platformVersion 2026.03; found ${String(document.platformVersion ?? "nothing")}.`,
      file,
    });
  }
}

async function inspectAppMetadata(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const file = "apps/hubspot/src/app/app-hsmeta.json";
  const document = await jsonFile(path.join(root, file), diagnostics, file);
  if (!document) return;
  const config = objectValue(document.config);
  const auth = objectValue(config?.auth);
  const redirects = stringArray(auth?.redirectUrls);
  const fetchUrls = stringArray(objectValue(config?.permittedUrls)?.fetch);
  if (auth?.type !== "oauth") {
    diagnostics.push({
      level: "error",
      code: "oauth-required",
      message: "The app metadata must use OAuth authentication.",
      file,
    });
  }
  if (redirects.length === 0) {
    diagnostics.push({
      level: "error",
      code: "oauth-redirect",
      message: "At least one OAuth redirect URL is required.",
      file,
    });
  }
  for (const redirect of redirects) {
    const parsed = safeUrl(redirect);
    if (!parsed || parsed.protocol !== "https:") {
      diagnostics.push({
        level: "error",
        code: "https-redirect",
        message: `OAuth redirect must use HTTPS: ${redirect}`,
        file,
      });
      continue;
    }
    if (!fetchUrls.includes(parsed.origin)) {
      diagnostics.push({
        level: "error",
        code: "permitted-origin",
        message: `permittedUrls.fetch must include ${parsed.origin}.`,
        file,
      });
    }
    if (parsed.hostname.endsWith(".example.com")) {
      diagnostics.push({
        level: "warning",
        code: "placeholder-origin",
        message: `Replace the placeholder API origin before upload: ${parsed.origin}`,
        file,
      });
    }
  }
}

async function inspectEnvironment(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const file = "services/api/.env.example";
  const absolute = path.join(root, file);
  if (!(await exists(absolute))) return;
  const content = await readFile(absolute, "utf8");
  for (const variable of [
    "HUBSPOT_CLIENT_ID",
    "HUBSPOT_CLIENT_SECRET",
    "PUBLIC_URL",
    "TOKEN_ENCRYPTION_KEY",
  ]) {
    if (!new RegExp(`^${variable}=`, "m").test(content)) {
      diagnostics.push({
        level: "error",
        code: "environment-variable",
        message: `.env.example must define ${variable}.`,
        file,
      });
    }
  }
}

async function inspectExtensionComponents(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const directory = path.join(root, "apps/hubspot/src/app");
  if (!(await exists(directory))) return;
  const files = await walk(directory);
  const metadata = files.filter((file) => file.endsWith("-hsmeta.json"));
  const types = new Set<string>();
  for (const absolute of metadata) {
    const relative = path.relative(root, absolute);
    const document = await jsonFile(absolute, diagnostics, relative);
    if (typeof document?.type === "string") types.add(document.type);
  }
  for (const type of ["page", "card", "settings"]) {
    if (!types.has(type)) {
      diagnostics.push({
        level: "error",
        code: "extension-component",
        message: `HubSpot component metadata for type '${type}' is missing.`,
      });
    }
  }
}

async function jsonFile(
  absolute: string,
  diagnostics: Diagnostic[],
  relative: string,
): Promise<Record<string, unknown> | undefined> {
  if (!(await exists(absolute))) return undefined;
  try {
    return JSON.parse(await readFile(absolute, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    diagnostics.push({
      level: "error",
      code: "invalid-json",
      message: `File is not valid JSON: ${relative}`,
      file: relative,
    });
    return undefined;
  }
}

async function walk(directory: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(absolute)));
    else results.push(absolute);
  }
  return results;
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

async function findUp(
  start: string,
  filename: string,
): Promise<string | undefined> {
  let current = start;
  while (true) {
    const candidate = path.join(current, filename);
    if (await exists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
