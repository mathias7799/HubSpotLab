import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SPOTKIT_VERSION } from "./version.js";

export interface CreateProjectOptions {
  slug: string;
  directory?: string;
  displayName?: string;
  description?: string;
  apiOrigin?: string;
  supportEmail?: string;
  profile?: "marketplace" | "private-static";
}

export interface CreateProjectResult {
  targetDirectory: string;
  filesCreated: number;
}

const TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../templates/project", import.meta.url),
);
const PRIVATE_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../templates/private-project", import.meta.url),
);
const RUNTIME_DIRECTORY = fileURLToPath(
  new URL("../../../packages/spotkit-runtime", import.meta.url),
);
const BUNDLED_RUNTIME_DIRECTORY = fileURLToPath(
  new URL("../runtime", import.meta.url),
);

export async function createProject(
  options: CreateProjectOptions,
): Promise<CreateProjectResult> {
  validateSlug(options.slug);
  const parent = path.resolve(options.directory ?? ".");
  const target = path.join(parent, options.slug);
  await assertEmptyTarget(target);
  await mkdir(target, { recursive: true });

  const displayName = options.displayName?.trim() || titleCase(options.slug);
  const description =
    options.description?.trim() ||
    `${displayName} HubSpot app generated with SpotKit.`;
  const apiOrigin =
    options.apiOrigin?.trim() || `https://${options.slug}.example.com`;
  const supportEmail = options.supportEmail?.trim() || "support@example.com";
  const profile = options.profile ?? "marketplace";
  const replacements = new Map([
    ["__SPOTKIT_SLUG__", options.slug],
    ["__SPOTKIT_UID__", options.slug.replaceAll("-", "_")],
    ["__SPOTKIT_DISPLAY_NAME__", displayName],
    ["__SPOTKIT_DISPLAY_NAME_JSON__", jsonContent(displayName)],
    ["__SPOTKIT_DESCRIPTION__", description],
    ["__SPOTKIT_DESCRIPTION_JSON__", jsonContent(description)],
    ["__SPOTKIT_API_ORIGIN__", apiOrigin],
    ["__SPOTKIT_API_ORIGIN_JSON__", jsonContent(apiOrigin)],
    ["__SPOTKIT_SUPPORT_EMAIL__", supportEmail],
    ["__SPOTKIT_SUPPORT_EMAIL_JSON__", jsonContent(supportEmail)],
    ["__SPOTKIT_VERSION__", SPOTKIT_VERSION],
  ]);
  let filesCreated = await copyTemplate(
    profile === "private-static"
      ? PRIVATE_TEMPLATE_DIRECTORY
      : TEMPLATE_DIRECTORY,
    target,
    replacements,
  );
  if (profile === "marketplace") {
    const runtimeDirectory = (await exists(RUNTIME_DIRECTORY))
      ? RUNTIME_DIRECTORY
      : BUNDLED_RUNTIME_DIRECTORY;
    if (!(await exists(runtimeDirectory))) {
      throw new Error(
        "SpotKit runtime templates are missing. Reinstall or rebuild the SpotKit package.",
      );
    }
    filesCreated += await copyRuntime(
      runtimeDirectory,
      path.join(target, "packages/spotkit-runtime"),
    );
  }
  return { targetDirectory: target, filesCreated };
}

async function copyRuntime(
  source: string,
  destination: string,
): Promise<number> {
  await mkdir(destination, { recursive: true });
  let count = 0;
  for (const name of ["package.json", "tsconfig.json", "src", "test"]) {
    const sourcePath = path.join(source, name);
    const destinationPath = path.join(destination, name);
    const entries = await readdir(sourcePath, { withFileTypes: true }).catch(
      () => undefined,
    );
    if (!entries) {
      await writeFile(destinationPath, await readFile(sourcePath));
      count += 1;
      continue;
    }
    await mkdir(destinationPath, { recursive: true });
    count += await copyTemplate(sourcePath, destinationPath, new Map());
  }
  return count;
}

function validateSlug(slug: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
    throw new Error(
      "Project slug must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens.",
    );
  }
}

async function assertEmptyTarget(target: string): Promise<void> {
  try {
    await access(target);
    const entries = await readdir(target);
    if (entries.length > 0) {
      throw new Error(`Target directory is not empty: ${target}`);
    }
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") {
      return;
    }
    throw cause;
  }
}

async function copyTemplate(
  source: string,
  destination: string,
  replacements: ReadonlyMap<string, string>,
): Promise<number> {
  let count = 0;
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const outputName = replace(entry.name, replacements).replace(/\.tpl$/, "");
    const sourcePath = path.join(source, entry.name);
    const outputPath = path.join(destination, outputName);
    if (entry.isDirectory()) {
      await mkdir(outputPath, { recursive: true });
      count += await copyTemplate(sourcePath, outputPath, replacements);
      continue;
    }
    const content = replace(await readFile(sourcePath, "utf8"), replacements);
    await writeFile(outputPath, content, "utf8");
    count += 1;
  }
  return count;
}

function replace(
  value: string,
  replacements: ReadonlyMap<string, string>,
): string {
  let result = value;
  for (const [token, replacement] of replacements) {
    result = result.replaceAll(token, replacement);
  }
  return result;
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function jsonContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}
