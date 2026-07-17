#!/usr/bin/env node
import { createProject } from "./create.js";
import { diagnoseProject } from "./doctor.js";
import { addFeature, featureCatalog, normalizeFeature } from "./features.js";
import { synchronizeOrigin } from "./origin.js";
import { prepareDevelopment, runDevelopment } from "./dev.js";
import {
  prepareTunnelDevelopment,
  runTunnelDevelopment,
  type TunnelProvider,
} from "./tunnel.js";
import { oauthReconnectUrl, openOAuthReconnect } from "./reconnect.js";
import { checkRelease, uploadHubSpotProject } from "./release.js";
import { smokeApplication } from "./smoke.js";
import { refreshDocumentation } from "./docs-refresh.js";
import { inspectProject } from "./inspect.js";
import path from "node:path";

const VERSION = "0.6.0";
const INVOCATION_DIRECTORY = process.env.INIT_CWD ?? process.cwd();

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const normalized = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...args] = normalized;
  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    return 0;
  }
  if (command === "--version" || command === "-v" || command === "version") {
    console.log(VERSION);
    return 0;
  }
  try {
    if (command === "create") return await createCommand(args);
    if (command === "doctor") return await doctorCommand(args);
    if (command === "add") return await addCommand(args);
    if (command === "features") return featuresCommand();
    if (command === "sync-origin") return await originCommand(args);
    if (command === "dev") return await devCommand(args);
    if (command === "tunnel") return await tunnelCommand(args);
    if (command === "reconnect") return await reconnectCommand(args);
    if (command === "release-check") return await releaseCheckCommand(args);
    if (command === "upload") return await uploadCommand(args);
    if (command === "smoke") return await smokeCommand(args);
    if (command === "docs-refresh") return await docsRefreshCommand(args);
    if (command === "inspect") return await inspectCommand(args);
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }
}

async function inspectCommand(args: string[]): Promise<number> {
  const inventory = await inspectProject(
    path.resolve(
      INVOCATION_DIRECTORY,
      args.find((value) => !value.startsWith("-")) ?? ".",
    ),
  );
  if (args.includes("--json")) {
    console.log(JSON.stringify(inventory, null, 2));
    return 0;
  }
  console.log(`${inventory.name} (${inventory.profile})`);
  console.log(`Root: ${inventory.root}`);
  console.log(`Platform: ${inventory.platformVersion}`);
  console.log(`API origin: ${inventory.apiOrigin ?? "none"}`);
  console.log(`Features: ${inventory.features.join(", ") || "none"}`);
  console.log(`App objects: ${inventory.appObjectCount}`);
  console.log(
    `Diagnostics: ${inventory.errors} errors, ${inventory.warnings} warnings`,
  );
  console.log(`Release ready: ${inventory.releaseReady ? "yes" : "no"}`);
  return 0;
}

async function docsRefreshCommand(args: string[]): Promise<number> {
  const write = args.includes("--confirm");
  const check = args.includes("--check");
  if (write && check)
    throw new Error("Use either --confirm or --check, not both.");
  if (!write && !check) {
    throw new Error(
      "Review screenshots, then pass --confirm to write or --check to verify.",
    );
  }
  const screenshots = options(args, "--screenshot").map((value) => {
    const separator = value.indexOf("=");
    if (separator < 1 || separator === value.length - 1) {
      throw new Error("--screenshot must use <label=png-path>.");
    }
    return {
      label: value.slice(0, separator),
      file: path.resolve(INVOCATION_DIRECTORY, value.slice(separator + 1)),
    };
  });
  const result = await refreshDocumentation({
    directory: commandDirectory(args, ["--screenshot"]),
    screenshots,
    write,
  });
  console.log(`SpotKit documentation refresh: ${result.root}`);
  for (const file of result.files)
    console.log(`${write ? "WROTE" : "DRIFT"} ${file}`);
  if (!result.changed) console.log("Screenshot documentation is current.");
  return check && result.changed ? 1 : 0;
}

async function smokeCommand(args: string[]): Promise<number> {
  const origin = args.find((value) => !value.startsWith("-"));
  if (!origin) throw new Error("Usage: spotkit smoke <https-origin>");
  const report = await smokeApplication(origin);
  console.log(`SpotKit smoke test: ${report.origin}`);
  for (const check of report.checks) {
    console.log(
      `${check.ok ? "PASS" : "FAIL"} [${check.name}] ${check.message}`,
    );
  }
  return report.ok ? 0 : 1;
}

async function releaseCheckCommand(args: string[]): Promise<number> {
  const directory = commandDirectory(args, ["--account", "--profile"]);
  const report = await checkRelease({
    directory,
    hubspot: args.includes("--hubspot"),
  });
  console.log(`SpotKit release check: ${report.root}`);
  for (const issue of report.issues) {
    console.log(
      `FAIL [${issue.code}] ${issue.file ? `${issue.file}: ` : ""}${issue.message}`,
    );
  }
  if (report.hubspotValidated) console.log("PASS HubSpot project validation");
  console.log(
    report.ok
      ? "Release checks passed."
      : `${report.issues.length} release issue(s).`,
  );
  return report.ok ? 0 : 1;
}

async function uploadCommand(args: string[]): Promise<number> {
  return await uploadHubSpotProject({
    directory: commandDirectory(args, ["--message", "--account", "--profile"]),
    confirm: args.includes("--confirm"),
    ...optional("message", option(args, "--message")),
    ...optional("account", option(args, "--account")),
    ...optional("profile", option(args, "--profile")),
  });
}

function commandDirectory(args: string[], valuedOptions: string[]): string {
  const positional = args.filter(
    (value, index) =>
      !value.startsWith("-") && !valuedOptions.includes(args[index - 1] ?? ""),
  );
  return path.resolve(INVOCATION_DIRECTORY, positional[0] ?? ".");
}

async function reconnectCommand(args: string[]): Promise<number> {
  const directory = path.resolve(
    INVOCATION_DIRECTORY,
    args.find((value) => !value.startsWith("-")) ?? ".",
  );
  const url = await oauthReconnectUrl(directory);
  console.log(`OAuth reconnect URL: ${url}`);
  if (args.includes("--open")) {
    openOAuthReconnect(url);
    console.log("Opened the reconnect URL after explicit --open confirmation.");
  } else {
    console.log("Review the URL, then rerun with --open to launch it.");
  }
  return 0;
}

async function tunnelCommand(args: string[]): Promise<number> {
  const provider = option(args, "--provider") ?? "cloudflare";
  if (provider !== "cloudflare" && provider !== "ngrok") {
    throw new Error("--provider must be cloudflare or ngrok.");
  }
  const positional = args.filter(
    (value, index) =>
      !value.startsWith("-") && args[index - 1] !== "--provider",
  );
  const options = {
    directory: path.resolve(INVOCATION_DIRECTORY, positional[0] ?? "."),
    provider: provider as TunnelProvider,
    check: args.includes("--check"),
  };
  const plan = await prepareTunnelDevelopment(options);
  console.log(
    `${plan.command.label}: ${plan.command.command} ${plan.command.args.join(" ")}`,
  );
  return options.check ? 0 : await runTunnelDevelopment(options);
}

async function devCommand(args: string[]): Promise<number> {
  const origin = option(args, "--origin");
  const positional = args.filter(
    (value, index) => !value.startsWith("-") && args[index - 1] !== "--origin",
  );
  const directory = path.resolve(INVOCATION_DIRECTORY, positional[0] ?? ".");
  const options = {
    directory,
    ...optional("origin", origin),
    apiOnly: args.includes("--api-only"),
    check: args.includes("--check"),
  };
  const plan = await prepareDevelopment(options);
  console.log(`SpotKit development: ${plan.root}`);
  for (const change of plan.originChanges) {
    console.log(`Origin ${change.file}: ${change.reasons.join(", ")}`);
  }
  for (const command of plan.commands) {
    console.log(
      `${command.label}: ${command.command} ${command.args.join(" ")}`,
    );
  }
  return options.check ? 0 : await runDevelopment(options, plan);
}

async function originCommand(args: string[]): Promise<number> {
  const values = args.filter((value) => !value.startsWith("-"));
  const origin = values[0];
  if (!origin) {
    throw new Error(
      "Usage: spotkit sync-origin <https-origin> [directory] [--check]",
    );
  }
  const check = args.includes("--check");
  const result = await synchronizeOrigin({
    origin,
    directory: path.resolve(INVOCATION_DIRECTORY, values[1] ?? "."),
    write: !check,
  });
  console.log(
    `${check ? "Would update" : "Updated"} ${result.changes.length} files for ${result.origin}`,
  );
  for (const change of result.changes) {
    console.log(`${change.file}: ${change.reasons.join(", ")}`);
  }
  if (!result.changed)
    console.log("Origin configuration is already synchronized.");
  return 0;
}

async function addCommand(args: string[]): Promise<number> {
  const name = args.find((value) => !value.startsWith("-"));
  if (!name) throw new Error("Usage: spotkit add <feature> [directory]");
  const remaining = args.filter(
    (value) => value !== name && !value.startsWith("-"),
  );
  const result = await addFeature({
    feature: normalizeFeature(name),
    directory: path.resolve(INVOCATION_DIRECTORY, remaining[0] ?? "."),
  });
  console.log(
    `Added ${result.feature} (${result.filesCreated} files) to ${result.root}`,
  );
  console.log(`Next: pnpm spotkit doctor ${result.root}`);
  return 0;
}

function featuresCommand(): number {
  console.log("SpotKit feature catalog:");
  for (const feature of featureCatalog) {
    console.log(`${feature.name.padEnd(24)} ${feature.availability}`);
  }
  return 0;
}

async function createCommand(args: string[]): Promise<number> {
  const slug = args.find((value) => !value.startsWith("-"));
  if (!slug) throw new Error("Usage: spotkit create <slug> [options]");
  const result = await createProject({
    slug,
    directory: path.resolve(
      INVOCATION_DIRECTORY,
      option(args, "--directory") ?? ".",
    ),
    ...optional("displayName", option(args, "--name")),
    ...optional("description", option(args, "--description")),
    ...optional("apiOrigin", option(args, "--api-origin")),
    ...optional("supportEmail", option(args, "--support-email")),
    profile: profile(option(args, "--profile")),
  });
  console.log(
    `Created ${result.filesCreated} files in ${result.targetDirectory}`,
  );
  console.log(`Next: pnpm spotkit doctor ${result.targetDirectory}`);
  return 0;
}

async function doctorCommand(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const strict = args.includes("--strict");
  const directory = path.resolve(
    INVOCATION_DIRECTORY,
    args.find((value) => !value.startsWith("-")) ?? ".",
  );
  const report = await diagnoseProject(directory);
  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return report.errors === 0 && (!strict || report.warnings === 0) ? 0 : 1;
  }
  console.log(`SpotKit doctor: ${report.root}`);
  for (const item of report.diagnostics) {
    const marker =
      item.level === "success"
        ? "PASS"
        : item.level === "warning"
          ? "WARN"
          : "FAIL";
    console.log(`${marker} [${item.code}] ${item.message}`);
  }
  console.log(`${report.errors} errors, ${report.warnings} warnings`);
  if (strict && report.warnings > 0) {
    console.log("Strict mode treats warnings as failures.");
  }
  return report.errors === 0 && (!strict || report.warnings === 0) ? 0 : 1;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function options(args: string[], name: string): string[] {
  return args.flatMap((value, index) =>
    args[index - 1] === name ? [value] : [],
  );
}

function optional<Key extends string>(
  key: Key,
  value: string | undefined,
): { [Property in Key]?: string } {
  return value === undefined
    ? {}
    : ({ [key]: value } as { [Property in Key]: string });
}

function profile(value: string | undefined): "marketplace" | "private-static" {
  if (value === undefined || value === "marketplace") return "marketplace";
  if (value === "private-static") return value;
  throw new Error("--profile must be marketplace or private-static.");
}

function printHelp(): void {
  console.log(`SpotKit ${VERSION}

Usage:
  spotkit create <slug> [options]
  spotkit add <feature> [directory]
  spotkit features
  spotkit sync-origin <https-origin> [directory] [--check]
  spotkit dev [directory] [--origin <https-origin>] [--api-only] [--check]
  spotkit tunnel [directory] [--provider cloudflare|ngrok] [--check]
  spotkit reconnect [directory] [--open]
  spotkit release-check [directory] [--hubspot]
  spotkit upload [directory] --confirm [--message <text>]
  spotkit smoke <https-origin>
  spotkit docs-refresh [directory] --screenshot <label=png-path> [--screenshot ...] --confirm|--check
  spotkit inspect [directory] [--json]
  spotkit doctor [directory] [--strict] [--json]

Create options:
  --directory <path>       Parent directory (default: current directory)
  --name <display name>    HubSpot app display name
  --description <text>     App description
  --api-origin <https URL> Public API origin
  --support-email <email>  Support contact
  --profile <profile>      marketplace or private-static

Doctor options:
  --strict                 Fail when warnings are present
  --json                   Print a machine-readable report

Examples:
  spotkit create handoff-ready --directory projects --name "HandoffReady"
  spotkit doctor projects/handoff-ready`);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  process.exitCode = await run();
}
