import { access, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface SynchronizeOriginOptions {
  directory?: string;
  origin: string;
  write?: boolean;
}

export interface OriginChange {
  file: string;
  reasons: string[];
}

export interface SynchronizeOriginResult {
  root: string;
  origin: string;
  changed: boolean;
  written: boolean;
  changes: OriginChange[];
}

interface PendingChange extends OriginChange {
  absolute: string;
  before: string;
  after: string;
}

export async function synchronizeOrigin(
  options: SynchronizeOriginOptions,
): Promise<SynchronizeOriginResult> {
  const root = path.resolve(options.directory ?? ".");
  const origin = validatedOrigin(options.origin);
  const appFile = "apps/hubspot/src/app/app-hsmeta.json";
  const appPath = path.join(root, appFile);
  if (!(await exists(appPath))) {
    throw new Error(
      `Not a SpotKit project; required file is missing: ${appFile}`,
    );
  }
  const appBefore = await readFile(appPath, "utf8");
  const app = JSON.parse(appBefore) as {
    config?: {
      auth?: { type?: string; redirectUrls?: string[] };
      permittedUrls?: { fetch?: string[] };
    };
  };
  if (app.config?.auth?.type !== "oauth") {
    throw new Error("Origin synchronization applies only to OAuth profiles.");
  }
  const previousOrigins = new Set<string>();
  for (const redirect of app.config.auth.redirectUrls ?? []) {
    try {
      previousOrigins.add(new URL(redirect).origin);
    } catch {
      // Doctor reports malformed existing values; sync still repairs them.
    }
  }
  app.config.auth.redirectUrls = [`${origin}/oauth/callback`];
  const fetchUrls = app.config.permittedUrls?.fetch ?? [];
  app.config.permittedUrls ??= {};
  app.config.permittedUrls.fetch = [
    ...fetchUrls.filter((value) => !previousOrigins.has(value)),
    origin,
  ].filter((value, index, values) => values.indexOf(value) === index);

  const pending: PendingChange[] = [];
  addChange(pending, root, appFile, appBefore, json(app), [
    "OAuth callback",
    "permitted fetch origin",
  ]);

  for (const envFile of ["services/api/.env.example", "services/api/.env"]) {
    const envPath = path.join(root, envFile);
    if (await exists(envPath)) {
      const before = await readFile(envPath, "utf8");
      const after = before.replace(/^PUBLIC_URL=.*$/m, `PUBLIC_URL=${origin}`);
      addChange(pending, root, envFile, before, after, ["PUBLIC_URL"]);
    }
  }

  const appDirectory = path.join(root, "apps/hubspot/src/app");
  for (const absolute of await walk(appDirectory)) {
    const relative = path.relative(root, absolute);
    if (absolute.endsWith("backend.ts")) {
      const before = await readFile(absolute, "utf8");
      const after = before.replace(
        /export const API_ORIGIN = "[^"]*";/,
        `export const API_ORIGIN = ${JSON.stringify(origin)};`,
      );
      addChange(pending, root, relative, before, after, ["UI API origin"]);
      continue;
    }
    if (!absolute.endsWith("-hsmeta.json") || absolute === appPath) continue;
    const before = await readFile(absolute, "utf8");
    const document = JSON.parse(before) as {
      type?: string;
      config?: {
        actionUrl?: string;
        settings?: { targetUrl?: string };
      };
    };
    const reasons: string[] = [];
    if (document.type === "webhooks" && document.config?.settings?.targetUrl) {
      document.config.settings.targetUrl = `${origin}/webhooks/hubspot`;
      reasons.push("webhook target");
    }
    if (document.type === "workflow-action" && document.config?.actionUrl) {
      const currentPath = new URL(document.config.actionUrl).pathname;
      document.config.actionUrl = `${origin}${currentPath}`;
      reasons.push("workflow or agent target");
    }
    if (reasons.length) {
      addChange(pending, root, relative, before, json(document), reasons);
    }
  }

  if (options.write) {
    for (const change of pending) {
      await writeFile(change.absolute, change.after, "utf8");
    }
  }
  return {
    root,
    origin,
    changed: pending.length > 0,
    written: Boolean(options.write),
    changes: pending.map(({ file, reasons }) => ({ file, reasons })),
  };
}

function addChange(
  pending: PendingChange[],
  root: string,
  file: string,
  before: string,
  after: string,
  reasons: string[],
): void {
  if (before === after) return;
  pending.push({
    absolute: path.join(root, file),
    file,
    reasons,
    before,
    after,
  });
}

function validatedOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Origin must be a valid absolute URL.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Origin must be an HTTPS origin without a path or query.");
  }
  return parsed.origin;
}

async function walk(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
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

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
