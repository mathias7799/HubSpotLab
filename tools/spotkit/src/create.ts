import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CreateProjectOptions {
  slug: string;
  directory?: string;
  displayName?: string;
  description?: string;
  apiOrigin?: string;
  supportEmail?: string;
}

export interface CreateProjectResult {
  targetDirectory: string;
  filesCreated: number;
}

const TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../templates/project", import.meta.url),
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
  ]);
  const filesCreated = await copyTemplate(
    TEMPLATE_DIRECTORY,
    target,
    replacements,
  );
  return { targetDirectory: target, filesCreated };
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
