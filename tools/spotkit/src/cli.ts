#!/usr/bin/env node
import { createProject } from "./create.js";
import { diagnoseProject } from "./doctor.js";
import { addFeature, featureCatalog, normalizeFeature } from "./features.js";
import path from "node:path";

const VERSION = "0.4.0";
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
    console.error(`Unknown command: ${command}`);
    printHelp();
    return 1;
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : String(cause));
    return 1;
  }
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
