import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { diagnoseProject } from "./doctor.js";
import { inspectProject } from "./inspect.js";
import { readManifest } from "./manifest.js";
import { SPOTKIT_VERSION } from "./version.js";

export interface RuntimeDifference {
  file: string;
  state: "missing" | "modified" | "project-only";
}

export interface UpgradePlan {
  root: string;
  currentVersion?: string;
  targetVersion: string;
  managed: boolean;
  upgradeAvailable: boolean;
  runtimeApplicable: boolean;
  runtimeDifferences: RuntimeDifference[];
  diagnostics: { errors: number; warnings: number };
  actions: string[];
}

const SOURCE_RUNTIME = fileURLToPath(
  new URL("../../../packages/spotkit-runtime", import.meta.url),
);
const BUNDLED_RUNTIME = fileURLToPath(new URL("../runtime", import.meta.url));

export async function planUpgrade(directory = "."): Promise<UpgradePlan> {
  const root = path.resolve(directory);
  await inspectProject(root);
  const manifest = await readManifest(root);
  const runtimeApplicable = await usesSpotKitRuntime(root);
  const runtimeDifferences = runtimeApplicable
    ? await compareRuntime(root)
    : [];
  const diagnostics = await diagnoseProject(root);
  const actions: string[] = [];
  if (!manifest) {
    actions.push(
      "Adopt the project with `spotkit manifest <directory> --confirm` before planning versioned upgrades.",
    );
  } else if (manifest.updatedWith !== SPOTKIT_VERSION) {
    actions.push(
      `Review the SpotKit changelog from ${manifest.updatedWith} to ${SPOTKIT_VERSION}.`,
    );
  }
  if (runtimeDifferences.length > 0) {
    actions.push(
      `Review and merge ${runtimeDifferences.length} embedded runtime difference(s); SpotKit will not overwrite them automatically.`,
    );
  }
  if (diagnostics.errors > 0 || diagnostics.warnings > 0) {
    actions.push(
      `Resolve ${diagnostics.errors} diagnostic error(s) and ${diagnostics.warnings} warning(s) before release.`,
    );
  }
  const upgradeAvailable =
    !manifest ||
    manifest.updatedWith !== SPOTKIT_VERSION ||
    runtimeDifferences.length > 0;
  if (actions.length === 0) {
    actions.push("No lifecycle upgrade work is currently required.");
  }
  return {
    root,
    ...(manifest ? { currentVersion: manifest.updatedWith } : {}),
    targetVersion: SPOTKIT_VERSION,
    managed: Boolean(manifest),
    upgradeAvailable,
    runtimeApplicable,
    runtimeDifferences,
    diagnostics: { errors: diagnostics.errors, warnings: diagnostics.warnings },
    actions,
  };
}

async function usesSpotKitRuntime(root: string): Promise<boolean> {
  const packageFile = path.join(root, "services/api/package.json");
  if (!(await exists(packageFile))) return false;
  try {
    const document = JSON.parse(await readFile(packageFile, "utf8")) as {
      dependencies?: Record<string, unknown>;
    };
    return (
      typeof document.dependencies?.["@hubspotlab/spotkit-runtime"] === "string"
    );
  } catch {
    return false;
  }
}

async function compareRuntime(root: string): Promise<RuntimeDifference[]> {
  const source = (await exists(SOURCE_RUNTIME))
    ? SOURCE_RUNTIME
    : BUNDLED_RUNTIME;
  if (!(await exists(source))) {
    throw new Error(
      "The SpotKit runtime payload is unavailable; rebuild or reinstall SpotKit.",
    );
  }
  const target = path.join(root, "packages/spotkit-runtime");
  const sourceFiles = await managedRuntimeFiles(source);
  const targetFiles = (await exists(target))
    ? await managedRuntimeFiles(target)
    : [];
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);
  const differences: RuntimeDifference[] = [];
  for (const file of sourceFiles) {
    const targetFile = path.join(target, file);
    if (!targetSet.has(file)) {
      differences.push({ file, state: "missing" });
      continue;
    }
    const [expected, actual] = await Promise.all([
      readFile(path.join(source, file)),
      readFile(targetFile),
    ]);
    if (!expected.equals(actual)) differences.push({ file, state: "modified" });
  }
  for (const file of targetFiles) {
    if (!sourceSet.has(file)) differences.push({ file, state: "project-only" });
  }
  return differences.sort((left, right) => left.file.localeCompare(right.file));
}

async function managedRuntimeFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  for (const name of ["package.json", "tsconfig.json", "src", "test"]) {
    const absolute = path.join(root, name);
    if (!(await exists(absolute))) continue;
    const entries = await readdir(absolute, { withFileTypes: true }).catch(
      () => undefined,
    );
    if (!entries) {
      results.push(name);
      continue;
    }
    results.push(...(await walk(absolute, name)));
  }
  return results.sort();
}

async function walk(directory: string, prefix: string): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) results.push(...(await walk(absolute, relative)));
    else results.push(relative);
  }
  return results;
}

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
