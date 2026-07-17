import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AddableFeature = "webhooks" | "workflow-action";

export interface AddFeatureOptions {
  feature: AddableFeature;
  directory?: string;
}

export interface AddFeatureResult {
  feature: AddableFeature;
  root: string;
  filesCreated: number;
}

export const featureCatalog = [
  { name: "page", availability: "included" },
  { name: "card", availability: "included" },
  { name: "settings", availability: "included" },
  { name: "webhooks", availability: "addable" },
  { name: "workflow-action", availability: "addable" },
  { name: "app-object", availability: "planned" },
  { name: "app-object-association", availability: "planned" },
  { name: "app-event", availability: "planned" },
  { name: "agent-tool", availability: "gated-planned" },
  { name: "app-function", availability: "private-app-only" },
  { name: "scim", availability: "private-app-only" },
] as const;

const FEATURE_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../templates/features", import.meta.url),
);

const integrations: Record<
  AddableFeature,
  { importLine: string; routeBlock: string }
> = {
  webhooks: {
    importLine:
      'import { handleHubSpotWebhooks } from "./features/webhooks.js";',
    routeBlock: `        const webhookResponse = await handleHubSpotWebhooks(request, context);
        if (webhookResponse) return webhookResponse;`,
  },
  "workflow-action": {
    importLine:
      'import { handleExampleWorkflowAction } from "./features/workflow-action.js";',
    routeBlock: `        const workflowActionResponse = await handleExampleWorkflowAction(request, context);
        if (workflowActionResponse) return workflowActionResponse;`,
  },
};

export function normalizeFeature(value: string): AddableFeature {
  if (value === "webhook" || value === "webhooks") return "webhooks";
  if (value === "workflow-action" || value === "workflow-actions") {
    return "workflow-action";
  }
  throw new Error(
    `Unknown addable feature '${value}'. Run spotkit features to see the catalog.`,
  );
}

export async function addFeature(
  options: AddFeatureOptions,
): Promise<AddFeatureResult> {
  const root = path.resolve(options.directory ?? ".");
  const appFile = path.join(root, "services/api/src/app.ts");
  const metadataFile = path.join(root, "apps/hubspot/src/app/app-hsmeta.json");
  const packageFile = path.join(root, "package.json");
  for (const file of [appFile, metadataFile, packageFile]) {
    if (!(await exists(file))) {
      throw new Error(
        `Not a SpotKit project; required file is missing: ${file}`,
      );
    }
  }
  const appSource = await readFile(appFile, "utf8");
  for (const marker of [
    "// spotkit:feature-imports",
    "// spotkit:feature-routes",
  ]) {
    if (!appSource.includes(marker)) {
      throw new Error(
        `SpotKit integration marker is missing from services/api/src/app.ts: ${marker}`,
      );
    }
  }

  const metadata = JSON.parse(await readFile(metadataFile, "utf8")) as {
    config?: { name?: string; auth?: { redirectUrls?: string[] } };
  };
  const packageDocument = JSON.parse(await readFile(packageFile, "utf8")) as {
    name?: string;
  };
  const slug = packageDocument.name?.split("/").at(-1);
  const displayName = metadata.config?.name;
  const redirect = metadata.config?.auth?.redirectUrls?.[0];
  if (!slug || !displayName || !redirect) {
    throw new Error("SpotKit project metadata is incomplete.");
  }
  const apiOrigin = new URL(redirect).origin;
  const replacements = new Map([
    ["__SPOTKIT_SLUG__", slug],
    ["__SPOTKIT_UID__", slug.replaceAll("-", "_")],
    ["__SPOTKIT_DISPLAY_NAME__", displayName],
    ["__SPOTKIT_DISPLAY_NAME_JSON__", jsonContent(displayName)],
    ["__SPOTKIT_API_ORIGIN__", apiOrigin],
    ["__SPOTKIT_API_ORIGIN_JSON__", jsonContent(apiOrigin)],
  ]);
  const source = path.join(FEATURE_TEMPLATE_DIRECTORY, options.feature);
  const files = await templateFiles(source);
  for (const file of files) {
    const relative = replace(file, replacements).replace(/\.tpl$/, "");
    if (await exists(path.join(root, relative))) {
      throw new Error(
        `Feature '${options.feature}' is already installed or would overwrite: ${relative}`,
      );
    }
  }

  let filesCreated = 0;
  for (const file of files) {
    const relative = replace(file, replacements).replace(/\.tpl$/, "");
    const output = path.join(root, relative);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(
      output,
      replace(await readFile(path.join(source, file), "utf8"), replacements),
      "utf8",
    );
    filesCreated += 1;
  }
  const integration = integrations[options.feature];
  const nextApp = appSource
    .replace(
      "// spotkit:feature-imports",
      `${integration.importLine}\n// spotkit:feature-imports`,
    )
    .replace(
      "        // spotkit:feature-routes",
      `${integration.routeBlock}\n        // spotkit:feature-routes`,
    );
  await writeFile(appFile, nextApp, "utf8");
  return { feature: options.feature, root, filesCreated };
}

async function templateFiles(
  directory: string,
  prefix = "",
): Promise<string[]> {
  const results: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      results.push(
        ...(await templateFiles(path.join(directory, entry.name), relative)),
      );
    } else {
      results.push(relative);
    }
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

function jsonContent(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}
