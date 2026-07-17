import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SPOTKIT_VERSION } from "./version.js";

export interface SpotKitManifest {
  $schema: string;
  schemaVersion: 1;
  createdWith: string;
  updatedWith: string;
}

export interface SynchronizeManifestOptions {
  directory?: string;
  write?: boolean;
}

export interface SynchronizeManifestResult {
  root: string;
  file: string;
  manifest: SpotKitManifest;
  changed: boolean;
  written: boolean;
}

export const MANIFEST_FILE = ".spotkit.json";
export const MANIFEST_SCHEMA =
  "https://raw.githubusercontent.com/mathias7799/HubSpotLab/main/tools/spotkit/docs/spotkit-manifest.schema.json";

export async function synchronizeManifest(
  options: SynchronizeManifestOptions = {},
): Promise<SynchronizeManifestResult> {
  const root = path.resolve(options.directory ?? ".");
  await assertProject(root);
  const absolute = path.join(root, MANIFEST_FILE);
  const previous = await readManifest(root);
  const manifest: SpotKitManifest = {
    $schema: MANIFEST_SCHEMA,
    schemaVersion: 1,
    createdWith: previous?.createdWith ?? SPOTKIT_VERSION,
    updatedWith: SPOTKIT_VERSION,
  };
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const current = await readFile(absolute, "utf8").catch(() => undefined);
  const changed = current !== next;
  const write = options.write ?? false;
  if (write && changed) await writeFile(absolute, next, "utf8");
  return {
    root,
    file: MANIFEST_FILE,
    manifest,
    changed,
    written: write && changed,
  };
}

export async function readManifest(
  directory: string,
): Promise<SpotKitManifest | undefined> {
  const absolute = path.join(path.resolve(directory), MANIFEST_FILE);
  if (!(await exists(absolute))) return undefined;
  let document: unknown;
  try {
    document = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    throw new Error(`${MANIFEST_FILE} must contain valid JSON.`);
  }
  if (!isManifest(document)) {
    throw new Error(
      `${MANIFEST_FILE} must use schemaVersion 1 and semantic createdWith/updatedWith versions.`,
    );
  }
  return document;
}

function isManifest(value: unknown): value is SpotKitManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const document = value as Record<string, unknown>;
  return (
    document.$schema === MANIFEST_SCHEMA &&
    document.schemaVersion === 1 &&
    semanticVersion(document.createdWith) &&
    semanticVersion(document.updatedWith)
  );
}

function semanticVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)
  );
}

async function assertProject(root: string): Promise<void> {
  for (const relative of [
    "package.json",
    "apps/hubspot/src/app/app-hsmeta.json",
  ]) {
    if (!(await exists(path.join(root, relative)))) {
      throw new Error(`Cannot create a SpotKit manifest; missing ${relative}.`);
    }
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
