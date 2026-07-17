import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type AddableFeature =
  | "webhooks"
  | "workflow-action"
  | "app-object"
  | "app-object-association"
  | "app-event"
  | "agent-tool"
  | "app-function-endpoint"
  | "app-function-private"
  | "scim";

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
  { name: "app-object", availability: "gated-addable" },
  { name: "app-object-association", availability: "gated-addable" },
  { name: "app-event", availability: "gated-addable" },
  { name: "agent-tool", availability: "gated-addable" },
  { name: "app-function-endpoint", availability: "private-addable" },
  { name: "app-function-private", availability: "private-addable" },
  { name: "scim", availability: "private-addable" },
] as const;

const FEATURE_TEMPLATE_DIRECTORY = fileURLToPath(
  new URL("../templates/features", import.meta.url),
);

const integrations: Partial<
  Record<AddableFeature, { importLine: string; routeBlock: string }>
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
  "agent-tool": {
    importLine:
      'import { handleExampleAgentTool } from "./features/agent-tool.js";',
    routeBlock: `        const agentToolResponse = await handleExampleAgentTool(request, context);
        if (agentToolResponse) return agentToolResponse;`,
  },
};

export function normalizeFeature(value: string): AddableFeature {
  if (value === "webhook" || value === "webhooks") return "webhooks";
  if (value === "workflow-action" || value === "workflow-actions") {
    return "workflow-action";
  }
  if (value === "app-object" || value === "app-objects") return "app-object";
  if (
    value === "app-object-association" ||
    value === "app-object-associations"
  ) {
    return "app-object-association";
  }
  if (value === "app-event" || value === "app-events") return "app-event";
  if (value === "agent-tool" || value === "agent-tools") return "agent-tool";
  if (value === "app-function-endpoint") return value;
  if (value === "app-function-private" || value === "app-function") {
    return "app-function-private";
  }
  if (value === "scim") return "scim";
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
  for (const file of [metadataFile, packageFile]) {
    if (!(await exists(file))) {
      throw new Error(
        `Not a SpotKit project; required file is missing: ${file}`,
      );
    }
  }
  const integration = integrations[options.feature];
  if (integration && !(await exists(appFile))) {
    throw new Error(
      `Feature '${options.feature}' requires the marketplace API profile.`,
    );
  }
  const appSource = (await exists(appFile))
    ? await readFile(appFile, "utf8")
    : "";
  if (integration) {
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
  }
  if (
    options.feature === "app-object-association" &&
    !(await exists(
      path.join(
        root,
        "apps/hubspot/src/app/app-objects/spotkit-record-hsmeta.json",
      ),
    ))
  ) {
    throw new Error(
      "Add the app-object feature before app-object-association.",
    );
  }

  const metadata = JSON.parse(await readFile(metadataFile, "utf8")) as {
    config?: {
      name?: string;
      distribution?: string;
      auth?: { type?: string; redirectUrls?: string[] };
    };
  };
  const packageDocument = JSON.parse(await readFile(packageFile, "utf8")) as {
    name?: string;
  };
  const slug = packageDocument.name?.split("/").at(-1);
  const displayName = metadata.config?.name;
  const redirect = metadata.config?.auth?.redirectUrls?.[0];
  if (!slug || !displayName) {
    throw new Error("SpotKit project metadata is incomplete.");
  }
  const privateStatic =
    metadata.config?.distribution === "private" &&
    metadata.config.auth?.type === "static";
  const privateOnly = [
    "app-function-endpoint",
    "app-function-private",
    "scim",
  ].includes(options.feature);
  if (privateOnly && !privateStatic) {
    throw new Error(
      `Feature '${options.feature}' requires a private-static SpotKit profile.`,
    );
  }
  if (
    ["app-object", "app-object-association", "app-event"].includes(
      options.feature,
    ) &&
    privateStatic
  ) {
    throw new Error(
      `Feature '${options.feature}' requires the OAuth marketplace profile.`,
    );
  }
  const apiOrigin = redirect ? new URL(redirect).origin : "";
  const replacements = new Map([
    ["__SPOTKIT_SLUG__", slug],
    ["__SPOTKIT_UID__", slug.replaceAll("-", "_")],
    ["__SPOTKIT_DISPLAY_NAME__", displayName],
    ["__SPOTKIT_DISPLAY_NAME_JSON__", jsonContent(displayName)],
    ["__SPOTKIT_API_ORIGIN__", apiOrigin],
    ["__SPOTKIT_API_ORIGIN_JSON__", jsonContent(apiOrigin)],
    ["__SPOTKIT_OBJECT_NAME__", objectName(slug)],
    ["__SPOTKIT_APP_PREFIX__", appPrefix(slug)],
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
  if (integration) {
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
  }
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

function objectName(slug: string): string {
  const base = slug
    .split("-")
    .map((part) => part.replace(/[^a-z]/g, ""))
    .filter(Boolean)
    .join("_")
    .toUpperCase()
    .slice(0, 41)
    .replace(/_+$/, "");
  return `${base}_RECORD`;
}

function appPrefix(slug: string): string {
  return slug
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("")
    .slice(0, 24);
}
