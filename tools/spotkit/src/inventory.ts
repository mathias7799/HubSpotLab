import { access, readdir } from "node:fs/promises";
import path from "node:path";

import { inspectProject, type ProjectInventory } from "./inspect.js";

export interface WorkspaceInventory {
  root: string;
  projects: ProjectInventory[];
  totals: {
    projects: number;
    releaseReady: number;
    errors: number;
    warnings: number;
    appObjects: number;
  };
  allReleaseReady: boolean;
}

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".hubspot",
  ".pnpm",
  ".serena",
  "build",
  "coverage",
  "dist",
  "node_modules",
]);

export async function inspectWorkspace(
  directory = ".",
): Promise<WorkspaceInventory> {
  const root = path.resolve(directory);
  const projectRoots = await discoverProjects(root);
  const projects = await Promise.all(projectRoots.map(inspectProject));
  projects.sort((left, right) => left.root.localeCompare(right.root));
  const totals = {
    projects: projects.length,
    releaseReady: projects.filter((project) => project.releaseReady).length,
    errors: projects.reduce((sum, project) => sum + project.errors, 0),
    warnings: projects.reduce((sum, project) => sum + project.warnings, 0),
    appObjects: projects.reduce(
      (sum, project) => sum + project.appObjectCount,
      0,
    ),
  };
  return {
    root,
    projects,
    totals,
    allReleaseReady:
      projects.length > 0 && totals.releaseReady === projects.length,
  };
}

async function discoverProjects(root: string): Promise<string[]> {
  if (!(await exists(root)))
    throw new Error(`Directory does not exist: ${root}`);
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    const marker = path.join(directory, "apps/hubspot/src/app/app-hsmeta.json");
    if (await exists(marker)) {
      results.push(directory);
      return;
    }
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || EXCLUDED_DIRECTORIES.has(entry.name))
        continue;
      await visit(path.join(directory, entry.name));
    }
  }
  await visit(root);
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
