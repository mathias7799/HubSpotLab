import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { diagnoseProject } from "./doctor.js";

export interface ProjectInventory {
  root: string;
  name: string;
  uid: string;
  profile: "marketplace" | "private-static" | "unknown";
  platformVersion: string;
  apiOrigin?: string;
  features: string[];
  appObjectCount: number;
  errors: number;
  warnings: number;
  releaseReady: boolean;
}

export async function inspectProject(
  directory = ".",
): Promise<ProjectInventory> {
  const root = path.resolve(directory);
  const appFile = path.join(root, "apps/hubspot/src/app/app-hsmeta.json");
  const projectFile = path.join(root, "apps/hubspot/hsproject.json");
  const app = await requiredJson(appFile);
  const project = await requiredJson(projectFile);
  const config = objectValue(app.config);
  const auth = objectValue(config?.auth);
  const profile =
    config?.distribution === "marketplace" && auth?.type === "oauth"
      ? "marketplace"
      : config?.distribution === "private" && auth?.type === "static"
        ? "private-static"
        : "unknown";
  const redirects = strings(auth?.redirectUrls);
  const apiOrigin = safeOrigin(redirects[0]);
  const features = new Set<string>();
  let appObjectCount = 0;
  const componentRoot = path.dirname(appFile);
  for (const file of await walk(componentRoot)) {
    if (!file.endsWith("-hsmeta.json") || file === appFile) continue;
    const document = await optionalJson(file);
    const type = typeof document?.type === "string" ? document.type : undefined;
    const componentConfig = objectValue(document?.config);
    if (type === "app-object") appObjectCount += 1;
    const feature = featureName(type, componentConfig);
    if (feature) features.add(feature);
  }
  const diagnostics = await diagnoseProject(root);
  return {
    root,
    name: typeof config?.name === "string" ? config.name : "Unknown app",
    uid: typeof app.uid === "string" ? app.uid : "unknown",
    profile,
    platformVersion:
      typeof project.platformVersion === "string"
        ? project.platformVersion
        : "unknown",
    ...(apiOrigin ? { apiOrigin } : {}),
    features: [...features].sort(),
    appObjectCount,
    errors: diagnostics.errors,
    warnings: diagnostics.warnings,
    releaseReady: diagnostics.errors === 0 && diagnostics.warnings === 0,
  };
}

function featureName(
  type: string | undefined,
  config: Record<string, unknown> | undefined,
): string | undefined {
  if (
    [
      "page",
      "card",
      "settings",
      "webhooks",
      "app-object",
      "app-object-association",
      "app-event",
      "scim",
    ].includes(type ?? "")
  ) {
    return type;
  }
  if (type === "workflow-action") {
    const clients = Array.isArray(config?.supportedClients)
      ? config.supportedClients
          .map(objectValue)
          .map((client) => client?.client)
          .filter((client): client is string => typeof client === "string")
      : [];
    return clients.includes("AGENTS") ? "agent-tool" : "workflow-action";
  }
  if (type === "app-function") {
    return objectValue(config?.endpoint)
      ? "app-function-endpoint"
      : "app-function-private";
  }
  return undefined;
}

async function requiredJson(file: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(
      `Cannot inspect ${file}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function optionalJson(
  file: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function walk(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    else files.push(absolute);
  }
  return files;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function safeOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}
