import { access, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { diagnoseProject } from "./doctor.js";

export interface ReleaseIssue {
  code: string;
  message: string;
  file?: string;
}

export interface ReleaseCheckOptions {
  directory?: string;
  hubspot?: boolean;
}

export interface ReleaseCheckReport {
  root: string;
  ok: boolean;
  issues: ReleaseIssue[];
  hubspotValidated: boolean;
}

export interface UploadOptions {
  directory?: string;
  confirm: boolean;
  message?: string;
  account?: string;
  profile?: string;
}

const secretPatterns = [
  {
    name: "HubSpot private app token",
    pattern: /\bpat-(?:na1|eu1|ap1)-[a-z0-9-]{20,}\b/gi,
  },
  {
    name: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
] as const;

export async function checkRelease(
  options: ReleaseCheckOptions = {},
): Promise<ReleaseCheckReport> {
  const root = path.resolve(options.directory ?? ".");
  const doctor = await diagnoseProject(root);
  const issues: ReleaseIssue[] = doctor.diagnostics
    .filter((diagnostic) => diagnostic.level !== "success")
    .map((diagnostic) => ({
      code: `doctor:${diagnostic.code}`,
      message: diagnostic.message,
      ...(diagnostic.file ? { file: diagnostic.file } : {}),
    }));
  for (const absolute of await releaseFiles(root)) {
    const relative = path.relative(root, absolute);
    const content = await readFile(absolute, "utf8").catch(() => undefined);
    if (content === undefined || Buffer.byteLength(content) > 1_048_576)
      continue;
    for (const secret of secretPatterns) {
      secret.pattern.lastIndex = 0;
      if (secret.pattern.test(content)) {
        issues.push({
          code: "secret",
          message: `${secret.name} appears in release content.`,
          file: relative,
        });
      }
    }
    if (deploymentFile(relative)) {
      for (const match of content.matchAll(/https:\/\/[a-z0-9._-]+/gi)) {
        const hostname = new URL(match[0]).hostname;
        if (reservedHostname(hostname)) {
          issues.push({
            code: "reserved-origin",
            message: `Reserved non-production origin appears in release content: ${match[0]}`,
            file: relative,
          });
        }
      }
    }
  }
  let hubspotValidated = false;
  if (options.hubspot && issues.length === 0) {
    const result = await runCommand(
      "hs",
      ["project", "validate"],
      path.join(root, "apps/hubspot"),
      false,
    );
    hubspotValidated = result === 0;
    if (!hubspotValidated) {
      issues.push({
        code: "hubspot-validation",
        message: "HubSpot CLI project validation failed.",
      });
    }
  }
  return { root, ok: issues.length === 0, issues, hubspotValidated };
}

function deploymentFile(relative: string): boolean {
  return (
    relative === "Dockerfile" ||
    relative.startsWith("apps/hubspot/src/") ||
    relative.startsWith("services/api/src/") ||
    relative.startsWith("services/api/deploy/")
  );
}

export async function uploadHubSpotProject(
  options: UploadOptions,
): Promise<number> {
  if (!options.confirm) {
    throw new Error(
      "Upload creates a HubSpot project build. Review release-check output and pass --confirm to continue.",
    );
  }
  const root = path.resolve(options.directory ?? ".");
  const report = await checkRelease({ directory: root, hubspot: true });
  if (!report.ok) {
    throw new Error(
      `Release check failed with ${report.issues.length} issue(s); upload was not started.`,
    );
  }
  const args = ["project", "upload"];
  if (options.message) args.push("--message", options.message);
  if (options.account) args.push("--account", options.account);
  if (options.profile) args.push("--profile", options.profile);
  return await runCommand("hs", args, path.join(root, "apps/hubspot"), true);
}

async function releaseFiles(root: string): Promise<string[]> {
  const excluded = new Set([
    ".git",
    ".hubspot",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".cache",
  ]);
  const results: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (excluded.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (!entry.name.startsWith(".env")) results.push(absolute);
    }
  }
  await visit(root);
  return results;
}

function reservedHostname(hostname: string): boolean {
  return (
    hostname === "example.com" ||
    hostname.endsWith(".example.com") ||
    hostname === "example.net" ||
    hostname.endsWith(".example.net") ||
    hostname === "example.org" ||
    hostname.endsWith(".example.org") ||
    ["invalid", "test", "localhost"].some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    ) ||
    hostname.endsWith(".trycloudflare.com") ||
    hostname.endsWith(".ngrok-free.app") ||
    hostname.endsWith(".ngrok.app") ||
    hostname.endsWith(".ngrok.io")
  );
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  inherit: boolean,
): Promise<number> {
  if (!(await exists(cwd))) throw new Error(`Directory does not exist: ${cwd}`);
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, INIT_CWD: cwd },
      stdio: inherit ? "inherit" : "pipe",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += String(chunk)));
    child.stderr?.on("data", (chunk) => (output += String(chunk)));
    child.once("error", (cause) =>
      reject(
        new Error(
          `${command} could not be started: ${cause.message}. Install @hubspot/cli and authenticate first.`,
        ),
      ),
    );
    child.once("exit", (code) => {
      if (!inherit && output.trim()) process.stdout.write(output);
      resolve(code ?? 1);
    });
  });
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}
