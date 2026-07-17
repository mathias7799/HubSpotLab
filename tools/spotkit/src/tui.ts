import path from "node:path";

import * as prompts from "@clack/prompts";

import { diagnoseProject } from "./doctor.js";
import { inspectProject } from "./inspect.js";
import { inspectWorkspace } from "./inventory.js";
import { synchronizeManifest } from "./manifest.js";
import { synchronizeOrigin } from "./origin.js";
import { oauthReconnectUrl, openOAuthReconnect } from "./reconnect.js";
import { checkRelease, uploadHubSpotProject } from "./release.js";
import { smokeApplication } from "./smoke.js";
import { planUpgrade } from "./upgrade.js";
import { SPOTKIT_VERSION } from "./version.js";

export interface TuiChoice {
  value: string;
  label: string;
  hint?: string;
}

export interface TuiIO {
  intro(message: string): void;
  outro(message: string): void;
  select(message: string, choices: TuiChoice[]): Promise<string | undefined>;
  confirm(
    message: string,
    initialValue?: boolean,
  ): Promise<boolean | undefined>;
  text(
    message: string,
    placeholder?: string,
    initialValue?: string,
  ): Promise<string | undefined>;
  show(
    title: string,
    body: string,
    level?: "info" | "success" | "warning" | "error",
  ): void;
}

export interface RunTuiOptions {
  directory?: string;
  io?: TuiIO;
}

export async function runTui(options: RunTuiOptions = {}): Promise<number> {
  const io = options.io ?? clackIO;
  const workspace = path.resolve(options.directory ?? ".");
  io.intro(`SpotKit ${SPOTKIT_VERSION} · HubSpot app control center`);
  const report = await inspectWorkspace(workspace);
  if (report.projects.length === 0) {
    io.show(
      "No HubSpot projects found",
      `Create one with spotkit create, or rerun the TUI from a directory containing apps/hubspot.`,
      "error",
    );
    io.outro("Nothing changed.");
    return 1;
  }
  let root =
    report.projects.length === 1
      ? report.projects[0]!.root
      : await selectProject(io, report.projects);
  if (!root) {
    io.outro("Exited without changes.");
    return 0;
  }
  while (true) {
    const project = await inspectProject(root);
    const action = await io.select(`${project.name} · choose an action`, [
      {
        value: "overview",
        label: "Overview",
        hint: "profile, features, readiness",
      },
      { value: "doctor", label: "Doctor", hint: "detailed diagnostics" },
      {
        value: "upgrade",
        label: "Upgrade plan",
        hint: "read-only lifecycle and runtime diff",
      },
      {
        value: "manifest",
        label: "Lifecycle manifest",
        hint: "preview and adopt safely",
      },
      {
        value: "origin",
        label: "Synchronize origin",
        hint: "preview every affected URL",
      },
      {
        value: "release",
        label: "Release",
        hint: "check, validate, or create a build",
      },
      {
        value: "oauth",
        label: "OAuth reconnect",
        hint: "review install URL before opening",
      },
      {
        value: "smoke",
        label: "Smoke test",
        hint: "deployed health and OAuth boundaries",
      },
      ...(report.projects.length > 1
        ? [
            {
              value: "switch",
              label: "Switch project",
              hint: "return to workspace inventory",
            },
          ]
        : []),
      { value: "exit", label: "Exit" },
    ]);
    if (!action || action === "exit") break;
    if (action === "switch") {
      const selected = await selectProject(io, report.projects);
      if (selected) root = selected;
      continue;
    }
    try {
      if (action === "overview") await showOverview(io, root);
      else if (action === "doctor") await showDoctor(io, root);
      else if (action === "upgrade") await showUpgrade(io, root);
      else if (action === "manifest") await manageManifest(io, root);
      else if (action === "origin") await manageOrigin(io, root);
      else if (action === "release") await manageRelease(io, root);
      else if (action === "oauth") await manageOAuth(io, root);
      else if (action === "smoke") await runSmoke(io, root);
    } catch (cause) {
      io.show(
        "Action failed",
        cause instanceof Error ? cause.message : String(cause),
        "error",
      );
    }
  }
  io.outro("SpotKit closed. No unconfirmed action was performed.");
  return 0;
}

async function selectProject(
  io: TuiIO,
  projects: Awaited<ReturnType<typeof inspectWorkspace>>["projects"],
): Promise<string | undefined> {
  return await io.select(
    "Select a HubSpot project",
    projects.map((project) => ({
      value: project.root,
      label: project.name,
      hint: `${project.profile} · ${project.releaseReady ? "ready" : `${project.errors}E/${project.warnings}W`}`,
    })),
  );
}

async function showOverview(io: TuiIO, root: string): Promise<void> {
  const project = await inspectProject(root);
  io.show(
    `${project.name} overview`,
    [
      `Profile       ${project.profile}`,
      `Platform      ${project.platformVersion}`,
      `API origin    ${project.apiOrigin ?? "none"}`,
      `Features      ${project.features.join(", ") || "none"}`,
      `App objects   ${project.appObjectCount}`,
      `Lifecycle     ${project.managedBySpotKit ? `${project.createdWith} → ${project.updatedWith}` : "unmanaged"}`,
      `Diagnostics   ${project.errors} errors · ${project.warnings} warnings`,
      `Release ready ${project.releaseReady ? "yes" : "no"}`,
    ].join("\n"),
    project.releaseReady ? "success" : "warning",
  );
}

async function showDoctor(io: TuiIO, root: string): Promise<void> {
  const report = await diagnoseProject(root);
  const body = report.diagnostics
    .map((item) => `${item.level.toUpperCase()} [${item.code}] ${item.message}`)
    .join("\n");
  io.show(
    `Doctor · ${report.errors} errors / ${report.warnings} warnings`,
    body,
    report.errors ? "error" : report.warnings ? "warning" : "success",
  );
}

async function showUpgrade(io: TuiIO, root: string): Promise<void> {
  const plan = await planUpgrade(root);
  const differences = plan.runtimeDifferences.map(
    (item) => `${item.state.toUpperCase()} ${item.file}`,
  );
  io.show(
    `Upgrade · ${plan.currentVersion ?? "unmanaged"} → ${plan.targetVersion}`,
    [
      `Embedded runtime ${plan.runtimeApplicable ? `${plan.runtimeDifferences.length} differences` : "not used"}`,
      ...differences,
      "",
      ...plan.actions.map((action) => `NEXT ${action}`),
    ].join("\n"),
    plan.upgradeAvailable ? "warning" : "success",
  );
}

async function manageManifest(io: TuiIO, root: string): Promise<void> {
  const preview = await synchronizeManifest({ directory: root });
  if (!preview.changed) {
    io.show("Lifecycle manifest", "The manifest is current.", "success");
    return;
  }
  io.show(
    "Lifecycle manifest preview",
    JSON.stringify(preview.manifest, null, 2),
    "info",
  );
  if (!(await io.confirm("Write this lifecycle manifest?", false))) return;
  await synchronizeManifest({ directory: root, write: true });
  io.show("Lifecycle manifest", "Manifest synchronized.", "success");
}

async function manageOrigin(io: TuiIO, root: string): Promise<void> {
  const project = await inspectProject(root);
  const origin = await io.text(
    "New public HTTPS origin",
    "https://api.example.com",
    project.apiOrigin,
  );
  if (!origin) return;
  const preview = await synchronizeOrigin({ directory: root, origin });
  if (!preview.changed) {
    io.show(
      "Origin synchronization",
      "Every known origin is already aligned.",
      "success",
    );
    return;
  }
  io.show(
    `Origin preview · ${preview.origin}`,
    preview.changes
      .map((change) => `${change.file}\n  ${change.reasons.join(", ")}`)
      .join("\n"),
    "warning",
  );
  if (!(await io.confirm(`Update ${preview.changes.length} files?`, false)))
    return;
  await synchronizeOrigin({ directory: root, origin, write: true });
  io.show(
    "Origin synchronization",
    "All known origins were updated.",
    "success",
  );
}

async function manageRelease(io: TuiIO, root: string): Promise<void> {
  const action = await io.select("Release action", [
    {
      value: "check",
      label: "Local release check",
      hint: "strict, secrets, origins",
    },
    {
      value: "validate",
      label: "Check + HubSpot validation",
      hint: "requires authenticated hs CLI",
    },
    {
      value: "upload",
      label: "Create HubSpot build",
      hint: "never deploys automatically",
    },
    { value: "back", label: "Back" },
  ]);
  if (!action || action === "back") return;
  const hubspot = action !== "check";
  const report = await checkRelease({ directory: root, hubspot });
  io.show(
    "Release check",
    report.ok
      ? `Passed.${report.hubspotValidated ? " HubSpot validation passed." : ""}`
      : report.issues
          .map((issue) => `${issue.code} ${issue.file ?? ""} ${issue.message}`)
          .join("\n"),
    report.ok ? "success" : "error",
  );
  if (action !== "upload" || !report.ok) return;
  const confirmed = await io.confirm(
    "Create a HubSpot project build? This uploads source but does not deploy it.",
    false,
  );
  if (!confirmed) return;
  const message = await io.text("Build message", "Release candidate");
  const exitCode = await uploadHubSpotProject({
    directory: root,
    confirm: true,
    ...(message?.trim() ? { message: message.trim() } : {}),
  });
  io.show(
    "HubSpot build",
    exitCode === 0
      ? "Build created. Review it in HubSpot before deploying."
      : `HubSpot CLI exited with code ${exitCode}.`,
    exitCode === 0 ? "success" : "error",
  );
}

async function manageOAuth(io: TuiIO, root: string): Promise<void> {
  const url = await oauthReconnectUrl(root);
  io.show("OAuth reconnect URL", url, "info");
  if (!(await io.confirm("Open this reviewed URL in the browser?", false)))
    return;
  openOAuthReconnect(url);
  io.show("OAuth reconnect", "Opened the reviewed URL.", "success");
}

async function runSmoke(io: TuiIO, root: string): Promise<void> {
  const project = await inspectProject(root);
  const origin = await io.text(
    "Deployed API origin",
    "https://api.example.com",
    project.apiOrigin,
  );
  if (!origin) return;
  const report = await smokeApplication(origin);
  io.show(
    `Smoke test · ${report.origin}`,
    report.checks
      .map(
        (check) =>
          `${check.ok ? "PASS" : "FAIL"} ${check.name} · ${check.message}`,
      )
      .join("\n"),
    report.ok ? "success" : "error",
  );
}

const clackIO: TuiIO = {
  intro: prompts.intro,
  outro: prompts.outro,
  async select(message, choices) {
    const result = await prompts.select({ message, options: choices });
    return prompts.isCancel(result) ? undefined : String(result);
  },
  async confirm(message, initialValue = false) {
    const result = await prompts.confirm({ message, initialValue });
    return prompts.isCancel(result) ? undefined : result;
  },
  async text(message, placeholder, initialValue) {
    const result = await prompts.text({
      message,
      ...(placeholder ? { placeholder } : {}),
      ...(initialValue ? { initialValue } : {}),
      validate(value) {
        return value?.trim() ? undefined : "A value is required.";
      },
    });
    return prompts.isCancel(result) ? undefined : result;
  },
  show(title, body, level = "info") {
    if (level === "success") prompts.log.success(`${title}\n${body}`);
    else if (level === "warning") prompts.log.warn(`${title}\n${body}`);
    else if (level === "error") prompts.log.error(`${title}\n${body}`);
    else prompts.note(body, title);
  },
};
