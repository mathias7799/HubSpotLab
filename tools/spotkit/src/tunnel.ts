import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

import {
  prepareDevelopment,
  superviseDevelopmentProcesses,
  type DevelopmentCommand,
} from "./dev.js";
import { synchronizeOrigin } from "./origin.js";

export type TunnelProvider = "cloudflare" | "ngrok";

export interface TunnelDevelopmentOptions {
  directory?: string;
  provider: TunnelProvider;
  port?: number;
  check?: boolean;
}

export interface TunnelDevelopmentPlan {
  root: string;
  provider: TunnelProvider;
  command: DevelopmentCommand;
}

export async function prepareTunnelDevelopment(
  options: TunnelDevelopmentOptions,
): Promise<TunnelDevelopmentPlan> {
  const root = path.resolve(options.directory ?? ".");
  await prepareDevelopment({ directory: root, apiOnly: true, check: true });
  const port = options.port ?? 8788;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Tunnel port must be between 1 and 65535.");
  }
  const command = tunnelCommand(options.provider, port, root);
  if (!(await commandAvailable(command.command))) {
    throw new Error(
      options.provider === "cloudflare"
        ? "cloudflared is not installed or not available on PATH."
        : "ngrok is not installed or not available on PATH.",
    );
  }
  return { root, provider: options.provider, command };
}

export async function runTunnelDevelopment(
  options: TunnelDevelopmentOptions,
): Promise<number> {
  const plan = await prepareTunnelDevelopment(options);
  if (options.check) return 0;
  const tunnel = spawn(plan.command.command, plan.command.args, {
    cwd: plan.command.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  tunnel.stdout?.pipe(process.stdout);
  tunnel.stderr?.pipe(process.stderr);
  try {
    const origin = await waitForTunnelOrigin(tunnel, options.provider);
    await synchronizeOrigin({ directory: plan.root, origin, write: true });
    const development = await prepareDevelopment({ directory: plan.root });
    const children: ChildProcess[] = [tunnel];
    for (const command of development.commands) {
      children.push(
        spawn(command.command, command.args, {
          cwd: command.cwd,
          env: process.env,
          stdio: "inherit",
        }),
      );
    }
    return await superviseDevelopmentProcesses(children);
  } catch (cause) {
    if (!tunnel.killed) tunnel.kill("SIGTERM");
    throw cause;
  }
}

export function extractTunnelOrigin(
  provider: TunnelProvider,
  output: string,
): string | undefined {
  const hosts =
    provider === "cloudflare"
      ? /https:\/\/[a-z0-9-]+\.trycloudflare\.com/gi
      : /https:\/\/[a-z0-9-]+\.(?:ngrok-free\.app|ngrok\.app|ngrok\.io)/gi;
  const match = output.match(hosts)?.[0];
  return match ? new URL(match).origin : undefined;
}

function tunnelCommand(
  provider: TunnelProvider,
  port: number,
  root: string,
): DevelopmentCommand {
  return provider === "cloudflare"
    ? {
        label: "Cloudflare Tunnel",
        command: "cloudflared",
        args: [
          "tunnel",
          "--url",
          `http://127.0.0.1:${port}`,
          "--no-autoupdate",
        ],
        cwd: root,
      }
    : {
        label: "ngrok",
        command: "ngrok",
        args: ["http", String(port), "--log", "stdout", "--log-format", "json"],
        cwd: root,
      };
}

async function waitForTunnelOrigin(
  child: ChildProcess,
  provider: TunnelProvider,
): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      cleanup();
      child.kill("SIGTERM");
      reject(new Error(`Timed out waiting for ${provider} public URL.`));
    }, 30_000);
    const onData = (chunk: Buffer | string) => {
      output = `${output}${String(chunk)}`.slice(-32_768);
      const origin = extractTunnelOrigin(provider, output);
      if (origin) {
        cleanup();
        resolve(origin);
      }
    };
    const onError = (cause: Error) => {
      cleanup();
      reject(cause);
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(
        new Error(`${provider} exited before publishing a URL (${code}).`),
      );
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout?.off("data", onData);
      child.stderr?.off("data", onData);
      child.off("error", onError);
      child.off("exit", onExit);
    };
    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.once("error", onError);
    child.once("exit", onExit);
  });
}

async function commandAvailable(command: string): Promise<boolean> {
  const directories = (process.env.PATH ?? "").split(path.delimiter);
  for (const directory of directories) {
    if (!directory) continue;
    try {
      await access(path.join(directory, command), constants.X_OK);
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}
