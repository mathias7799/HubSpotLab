import { access, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

export async function oauthReconnectUrl(directory = "."): Promise<string> {
  const root = path.resolve(directory);
  const file = path.join(root, "apps/hubspot/src/app/app-hsmeta.json");
  if (!(await exists(file))) {
    throw new Error("OAuth app metadata was not found.");
  }
  const document = JSON.parse(await readFile(file, "utf8")) as {
    config?: { auth?: { type?: string; redirectUrls?: string[] } };
  };
  if (document.config?.auth?.type !== "oauth") {
    throw new Error("Reconnect applies only to OAuth profiles.");
  }
  const redirect = document.config.auth.redirectUrls?.[0];
  if (!redirect) throw new Error("OAuth redirect URL is missing.");
  return `${new URL(redirect).origin}/oauth/install?returnTo=%2Finstalled`;
}

export function openOAuthReconnect(url: string): void {
  const [command, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}
