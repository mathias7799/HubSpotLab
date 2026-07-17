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
  await inspectFeatureComponents(root, diagnostics);
  await inspectHosting(root, diagnostics);
  await inspectObjectStorageRecipe(root, diagnostics);

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
    if (parsed.pathname !== "/oauth/callback") {
      diagnostics.push({
        level: "error",
        code: "oauth-callback-path",
        message: `OAuth redirect must end at /oauth/callback: ${redirect}`,
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
    if (isTemporaryTunnel(parsed.hostname)) {
      diagnostics.push({
        level: "warning",
        code: "temporary-tunnel",
        message: `Use a stable production origin before release: ${parsed.origin}`,
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
  const environment = parseEnvironment(content);
  for (const variable of [
    "HUBSPOT_CLIENT_ID",
    "HUBSPOT_CLIENT_SECRET",
    "HUBSPOT_SCOPES",
    "PUBLIC_URL",
    "TOKEN_ENCRYPTION_KEY",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS",
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
  if (
    environment.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS !== undefined &&
    environment.ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS !== "false"
  ) {
    diagnostics.push({
      level: "error",
      code: "unsigned-production-requests",
      message:
        ".env.example must default ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS to false.",
      file,
    });
  }

  const metadataFile = "apps/hubspot/src/app/app-hsmeta.json";
  const metadata = await jsonFile(
    path.join(root, metadataFile),
    diagnostics,
    metadataFile,
  );
  const auth = objectValue(objectValue(metadata?.config)?.auth);
  const redirect = stringArray(auth?.redirectUrls)[0];
  const publicUrl = environment.PUBLIC_URL;
  if (redirect && publicUrl) {
    const parsedRedirect = safeUrl(redirect);
    const parsedPublicUrl = safeUrl(publicUrl);
    if (
      !parsedPublicUrl ||
      parsedPublicUrl.pathname !== "/" ||
      parsedPublicUrl.search !== "" ||
      parsedPublicUrl.hash !== ""
    ) {
      diagnostics.push({
        level: "error",
        code: "public-url-origin",
        message: "PUBLIC_URL must be an absolute origin without a path.",
        file,
      });
    } else if (parsedRedirect?.origin !== parsedPublicUrl.origin) {
      diagnostics.push({
        level: "error",
        code: "public-url-mismatch",
        message: `PUBLIC_URL ${publicUrl} does not match the OAuth origin ${parsedRedirect?.origin ?? redirect}.`,
        file,
      });
    }
  }

  const configuredScopes = splitScopes(environment.HUBSPOT_SCOPES);
  const requiredScopes = stringArray(auth?.requiredScopes);
  const missingScopes = requiredScopes.filter(
    (scope) => !configuredScopes.includes(scope),
  );
  if (environment.HUBSPOT_SCOPES !== undefined && missingScopes.length > 0) {
    diagnostics.push({
      level: "error",
      code: "scope-mismatch",
      message: `HUBSPOT_SCOPES is missing metadata scopes: ${missingScopes.join(", ")}.`,
      file,
    });
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

async function inspectFeatureComponents(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const appDirectory = path.join(root, "apps/hubspot/src/app");
  if (!(await exists(appDirectory))) return;
  const appMetadata = await jsonFile(
    path.join(appDirectory, "app-hsmeta.json"),
    diagnostics,
    "apps/hubspot/src/app/app-hsmeta.json",
  );
  const permitted = stringArray(
    objectValue(objectValue(appMetadata?.config)?.permittedUrls)?.fetch,
  );
  const apiFile = "services/api/src/app.ts";
  const api = (await exists(path.join(root, apiFile)))
    ? await readFile(path.join(root, apiFile), "utf8")
    : "";
  for (const absolute of (await walk(appDirectory)).filter((file) =>
    file.endsWith("-hsmeta.json"),
  )) {
    const relative = path.relative(root, absolute);
    const document = await jsonFile(absolute, diagnostics, relative);
    const config = objectValue(document?.config);
    if (document?.type === "webhooks") {
      const settings = objectValue(config?.settings);
      validateFeatureTarget(
        settings?.targetUrl,
        "/webhooks/hubspot",
        permitted,
        diagnostics,
        relative,
      );
      const concurrency = settings?.maxConcurrentRequests;
      if (
        typeof concurrency !== "number" ||
        !Number.isInteger(concurrency) ||
        concurrency < 1 ||
        concurrency > 100
      ) {
        diagnostics.push({
          level: "error",
          code: "webhook-concurrency",
          message: "Webhook maxConcurrentRequests must be between 1 and 100.",
          file: relative,
        });
      }
      const handler = "services/api/src/features/webhooks.ts";
      if (
        !(await exists(path.join(root, handler))) ||
        !api.includes("handleHubSpotWebhooks")
      ) {
        diagnostics.push({
          level: "error",
          code: "webhook-handler",
          message:
            "Webhook metadata must have its generated API handler wired in.",
          file: handler,
        });
      }
    }
    if (document?.type === "workflow-action") {
      validateFeatureTarget(
        config?.actionUrl,
        "/workflow-actions/example",
        permitted,
        diagnostics,
        relative,
      );
      if (typeof config?.isPublished !== "boolean") {
        diagnostics.push({
          level: "error",
          code: "workflow-published",
          message:
            "Workflow action isPublished must be explicitly true or false.",
          file: relative,
        });
      }
      if (
        !Array.isArray(config?.objectTypes) ||
        config.objectTypes.length === 0
      ) {
        diagnostics.push({
          level: "error",
          code: "workflow-object-types",
          message: "Workflow action must support at least one object type.",
          file: relative,
        });
      }
      const handler = "services/api/src/features/workflow-action.ts";
      if (
        !(await exists(path.join(root, handler))) ||
        !api.includes("handleExampleWorkflowAction")
      ) {
        diagnostics.push({
          level: "error",
          code: "workflow-handler",
          message:
            "Workflow action metadata must have its generated API handler wired in.",
          file: handler,
        });
      }
    }
  }
}

function validateFeatureTarget(
  value: unknown,
  expectedPath: string,
  permitted: string[],
  diagnostics: Diagnostic[],
  file: string,
): void {
  if (typeof value !== "string") {
    diagnostics.push({
      level: "error",
      code: "feature-target",
      message: `Feature target URL is missing; expected ${expectedPath}.`,
      file,
    });
    return;
  }
  const parsed = safeUrl(value);
  if (
    !parsed ||
    parsed.protocol !== "https:" ||
    parsed.pathname !== expectedPath
  ) {
    diagnostics.push({
      level: "error",
      code: "feature-target",
      message: `Feature target must be HTTPS and end at ${expectedPath}: ${value}`,
      file,
    });
    return;
  }
  if (!permitted.includes(parsed.origin)) {
    diagnostics.push({
      level: "error",
      code: "feature-permitted-origin",
      message: `permittedUrls.fetch must include feature origin ${parsed.origin}.`,
      file,
    });
  }
}

async function inspectHosting(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const packageFile = "services/api/package.json";
  const packageDocument = await jsonFile(
    path.join(root, packageFile),
    diagnostics,
    packageFile,
  );
  const dependencies = objectValue(packageDocument?.dependencies);
  if (typeof dependencies?.["@hubspotlab/spotkit-runtime"] !== "string") return;

  for (const file of [
    "Dockerfile",
    ".dockerignore",
    "services/api/host.json",
    "services/api/deploy/aws-sam.yaml",
    "services/api/src/adapters/node.ts",
    "services/api/src/adapters/aws-lambda.ts",
    "services/api/src/adapters/azure.ts",
  ]) {
    if (!(await exists(path.join(root, file)))) {
      diagnostics.push({
        level: "error",
        code: "hosting-file",
        message: `Production hosting asset is missing: ${file}`,
        file,
      });
    }
  }

  const scripts = objectValue(packageDocument?.scripts);
  const build = typeof scripts?.build === "string" ? scripts.build : "";
  for (const entry of ["node.ts", "aws-lambda.ts", "azure.ts"]) {
    if (!build.includes(entry)) {
      diagnostics.push({
        level: "error",
        code: "hosting-build",
        message: `API build does not include ${entry}.`,
        file: packageFile,
      });
    }
  }

  await inspectTextFile(root, ".dockerignore", diagnostics, [
    {
      pattern: /(^|\n)\.env(\n|$)/,
      message: ".dockerignore must exclude .env.",
    },
    {
      pattern: /\*\*\/node_modules|(^|\n)node_modules/,
      message: ".dockerignore must exclude node_modules.",
    },
  ]);
  await inspectTextFile(root, "Dockerfile", diagnostics, [
    {
      pattern: /USER\s+node/,
      message: "Container must run as a non-root user.",
    },
    {
      pattern: /HEALTHCHECK/,
      message: "Container must define a health check.",
    },
    {
      pattern: /dist\/node\.js/,
      message: "Container must run the production Node bundle.",
    },
  ]);
  await inspectTextFile(root, "services/api/deploy/aws-sam.yaml", diagnostics, [
    { pattern: /Runtime:\s+nodejs24\.x/, message: "AWS must use Node.js 24." },
    {
      pattern: /Handler:\s+dist\/aws-lambda\.handler/,
      message: "AWS must use the generated Lambda handler.",
    },
    {
      pattern: /ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS:\s+["']false["']/,
      message: "AWS must disable unsigned development requests.",
    },
  ]);
}

async function inspectObjectStorageRecipe(
  root: string,
  diagnostics: Diagnostic[],
): Promise<void> {
  const recipeFile = "services/api/src/storage/hubspot-configuration.ts";
  const recipePath = path.join(root, recipeFile);
  if (!(await exists(recipePath))) return;
  const recipe = await readFile(recipePath, "utf8");
  if (!recipe.includes("HubSpotObjectConfigurationStore")) {
    diagnostics.push({
      level: "error",
      code: "object-storage-recipe",
      message:
        "The HubSpot configuration recipe must use the tested SpotKit store.",
      file: recipeFile,
    });
  }

  const appFile = "services/api/src/app.ts";
  const appPath = path.join(root, appFile);
  if (!(await exists(appPath))) return;
  const app = await readFile(appPath, "utf8");
  if (!app.includes("createHubSpotConfigurationStore")) return;

  const metadataFile = "apps/hubspot/src/app/app-hsmeta.json";
  const metadata = await jsonFile(
    path.join(root, metadataFile),
    diagnostics,
    metadataFile,
  );
  const auth = objectValue(objectValue(metadata?.config)?.auth);
  const metadataScopes = new Set([
    ...stringArray(auth?.requiredScopes),
    ...stringArray(auth?.optionalScopes),
  ]);
  const envFile = "services/api/.env.example";
  const envPath = path.join(root, envFile);
  const env = (await exists(envPath))
    ? parseEnvironment(await readFile(envPath, "utf8"))
    : {};
  const runtimeScopes = new Set(splitScopes(env.HUBSPOT_SCOPES));
  const required = [
    "crm.schemas.custom.read",
    "crm.objects.custom.read",
    "crm.objects.custom.write",
  ];
  const missingMetadata = required.filter(
    (scope) => !metadataScopes.has(scope),
  );
  const missingRuntime = required.filter((scope) => !runtimeScopes.has(scope));
  if (missingMetadata.length) {
    diagnostics.push({
      level: "error",
      code: "object-storage-scopes",
      message: `One-object storage is enabled but app metadata is missing: ${missingMetadata.join(", ")}.`,
      file: metadataFile,
    });
  }
  if (missingRuntime.length) {
    diagnostics.push({
      level: "error",
      code: "object-storage-runtime-scopes",
      message: `One-object storage is enabled but HUBSPOT_SCOPES is missing: ${missingRuntime.join(", ")}.`,
      file: envFile,
    });
  }
}

async function inspectTextFile(
  root: string,
  file: string,
  diagnostics: Diagnostic[],
  requirements: Array<{ pattern: RegExp; message: string }>,
): Promise<void> {
  const absolute = path.join(root, file);
  if (!(await exists(absolute))) return;
  const content = await readFile(absolute, "utf8");
  for (const requirement of requirements) {
    if (!requirement.pattern.test(content)) {
      diagnostics.push({
        level: "error",
        code: "hosting-security",
        message: requirement.message,
        file,
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

function parseEnvironment(content: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      values[match[1]] = match[2].trim();
    }
  }
  return values;
}

function splitScopes(value: string | undefined): string[] {
  return value?.split(/[\s,]+/).filter(Boolean) ?? [];
}

function isTemporaryTunnel(hostname: string): boolean {
  return (
    hostname === "ngrok.io" ||
    hostname.endsWith(".ngrok.io") ||
    hostname === "ngrok-free.app" ||
    hostname.endsWith(".ngrok-free.app") ||
    hostname === "ngrok.app" ||
    hostname.endsWith(".ngrok.app") ||
    hostname === "trycloudflare.com" ||
    hostname.endsWith(".trycloudflare.com")
  );
}
