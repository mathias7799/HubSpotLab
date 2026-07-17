import { access, readFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import { synchronizeOrigin, type OriginChange } from "./origin.js";

export interface DevelopmentOptions {
  directory?: string;
  origin?: string;
  apiOnly?: boolean;
  check?: boolean;
}

export interface DevelopmentCommand {
  label: string;
  command: string;
  args: string[];
  cwd: string;
}

export interface DevelopmentPlan {
  root: string;
  originChanges: OriginChange[];
  commands: DevelopmentCommand[];
}

export async function prepareDevelopment(
  options: DevelopmentOptions,
): Promise<DevelopmentPlan> {
  const root = path.resolve(options.directory ?? ".");
  const metadataFile = path.join(root, "apps/hubspot/src/app/app-hsmeta.json");
  const apiDirectory = path.join(root, "services/api");
  if (!(await exists(metadataFile)) || !(await exists(apiDirectory))) {
    throw new Error(
      "spotkit dev requires an OAuth marketplace project with services/api.",
    );
  }
  const metadata = JSON.parse(await readFile(metadataFile, "utf8")) as {
    config?: { auth?: { type?: string } };
  };
  if (metadata.config?.auth?.type !== "oauth") {
    throw new Error(
      "spotkit dev currently supports the OAuth marketplace profile.",
    );
  }
  if (!(await exists(path.join(apiDirectory, ".env")))) {
    throw new Error(
      "Missing services/api/.env. Copy .env.example and add local OAuth credentials before running spotkit dev.",
    );
  }
  const originChanges = options.origin
    ? (
        await synchronizeOrigin({
          directory: root,
          origin: options.origin,
          write: !options.check,
        })
      ).changes
    : [];
  const commands: DevelopmentCommand[] = [
    {
      label: "API",
      command: "pnpm",
      args: ["dev"],
      cwd: apiDirectory,
    },
  ];
  if (!options.apiOnly) {
    commands.push({
      label: "HubSpot",
      command: "hs",
      args: ["project", "dev"],
      cwd: path.join(root, "apps/hubspot"),
    });
  }
  return { root, originChanges, commands };
}

export async function runDevelopment(
  options: DevelopmentOptions,
  prepared?: DevelopmentPlan,
): Promise<number> {
  const plan = prepared ?? (await prepareDevelopment(options));
  if (options.check) return 0;
  const children = plan.commands.map((item) =>
    spawn(item.command, item.args, {
      cwd: item.cwd,
      env: process.env,
      stdio: "inherit",
    }),
  );
  return await superviseDevelopmentProcesses(children);
}

export async function superviseDevelopmentProcesses(
  children: ChildProcess[],
): Promise<number> {
  return await new Promise<number>((resolve) => {
    let finished = false;
    const stop = (signal: NodeJS.Signals = "SIGTERM", code = 0) => {
      if (finished) return;
      finished = true;
      for (const child of children) {
        if (!child.killed) child.kill(signal);
      }
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
      resolve(code);
    };
    const interrupt = () => stop("SIGINT", 130);
    const terminate = () => stop("SIGTERM", 143);
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    for (const child of children) {
      child.once("error", () => stop("SIGTERM", 1));
      child.once("exit", (code, signal) =>
        stop("SIGTERM", signal ? 1 : (code ?? 0)),
      );
    }
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
