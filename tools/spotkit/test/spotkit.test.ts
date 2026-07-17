import { chmod, mkdtemp, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { createProject } from "../src/create.js";
import { diagnoseProject } from "../src/doctor.js";
import { addFeature, normalizeFeature } from "../src/features.js";
import { synchronizeOrigin } from "../src/origin.js";
import { prepareDevelopment } from "../src/dev.js";
import {
  extractTunnelOrigin,
  prepareTunnelDevelopment,
} from "../src/tunnel.js";
import { oauthReconnectUrl } from "../src/reconnect.js";
import { checkRelease, uploadHubSpotProject } from "../src/release.js";
import { smokeApplication } from "../src/smoke.js";
import { refreshDocumentation } from "../src/docs-refresh.js";
import { inspectProject } from "../src/inspect.js";
import { synchronizeManifest } from "../src/manifest.js";
import { planUpgrade } from "../src/upgrade.js";
import { inspectWorkspace } from "../src/inventory.js";
import { SPOTKIT_VERSION } from "../src/version.js";
import { runTui, type TuiIO } from "../src/tui.js";

describe("SpotKit", () => {
  it("keeps the package and CLI versions synchronized", async () => {
    const packageDocument = JSON.parse(
      await readFile(
        fileURLToPath(new URL("../package.json", import.meta.url)),
        "utf8",
      ),
    ) as { version: string };
    expect(SPOTKIT_VERSION).toBe(packageDocument.version);
  });

  it("creates a complete HubSpot project skeleton", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "handoff-ready",
      directory: parent,
      displayName: "HandoffReady",
      apiOrigin: "https://handoff.example.net",
    });
    expect(result.filesCreated).toBeGreaterThan(10);
    const metadata = JSON.parse(
      await readFile(
        path.join(
          result.targetDirectory,
          "apps/hubspot/src/app/app-hsmeta.json",
        ),
        "utf8",
      ),
    ) as { config: { name: string } };
    expect(metadata.config.name).toBe("HandoffReady");
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.errors).toBe(0);
    expect(report.warnings).toBe(0);
    expect(await inspectProject(result.targetDirectory)).toMatchObject({
      managedBySpotKit: true,
      createdWith: "0.7.0",
      updatedWith: "0.7.0",
    });
  });

  it("adopts and validates a lifecycle manifest without duplicating app metadata", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "manifest-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    const file = path.join(result.targetDirectory, ".spotkit.json");
    await unlink(file);
    await expect(
      synchronizeManifest({ directory: result.targetDirectory }),
    ).resolves.toMatchObject({ changed: true, written: false });
    await expect(
      synchronizeManifest({ directory: result.targetDirectory, write: true }),
    ).resolves.toMatchObject({ changed: true, written: true });
    const manifest = JSON.parse(await readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(manifest).sort()).toEqual([
      "$schema",
      "createdWith",
      "schemaVersion",
      "updatedWith",
    ]);
    expect(
      await synchronizeManifest({ directory: result.targetDirectory }),
    ).toMatchObject({ changed: false, written: false });
    await writeFile(file, '{"schemaVersion":99}\n', "utf8");
    expect(
      (await diagnoseProject(result.targetDirectory)).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "spotkit-manifest", level: "error" }),
    );
  });

  it("plans runtime upgrades without overwriting project changes", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "upgrade-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    await expect(planUpgrade(result.targetDirectory)).resolves.toMatchObject({
      currentVersion: "0.7.0",
      targetVersion: "0.7.0",
      managed: true,
      upgradeAvailable: false,
      runtimeDifferences: [],
    });
    const runtimeFile = path.join(
      result.targetDirectory,
      "packages/spotkit-runtime/src/crypto.ts",
    );
    const original = await readFile(runtimeFile, "utf8");
    await writeFile(
      runtimeFile,
      `${original}\n// Product-owned change.\n`,
      "utf8",
    );
    const changed = await planUpgrade(result.targetDirectory);
    expect(changed.upgradeAvailable).toBe(true);
    expect(changed.runtimeDifferences).toContainEqual({
      file: "src/crypto.ts",
      state: "modified",
    });
    expect(changed.actions.join(" ")).toContain("will not overwrite");
    await writeFile(runtimeFile, original, "utf8");
    await writeFile(
      path.join(result.targetDirectory, ".spotkit.json"),
      `${JSON.stringify(
        {
          $schema:
            "https://raw.githubusercontent.com/mathias7799/HubSpotLab/main/tools/spotkit/docs/spotkit-manifest.schema.json",
          schemaVersion: 1,
          createdWith: "0.5.0",
          updatedWith: "0.5.0",
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    await expect(planUpgrade(result.targetDirectory)).resolves.toMatchObject({
      currentVersion: "0.5.0",
      targetVersion: "0.7.0",
      upgradeAvailable: true,
      runtimeDifferences: [],
    });
  });

  it("inventories every HubSpot app in a workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spotkit-workspace-"));
    await createProject({
      slug: "ready-app",
      directory: root,
      apiOrigin: "https://api.ready-app.com",
    });
    await createProject({
      slug: "placeholder-app",
      directory: root,
    });
    const report = await inspectWorkspace(root);
    expect(report.projects.map((project) => project.name)).toEqual([
      "Placeholder App",
      "Ready App",
    ]);
    expect(report.totals).toEqual({
      projects: 2,
      releaseReady: 1,
      errors: 0,
      warnings: 1,
      appObjects: 0,
    });
    expect(report.allReleaseReady).toBe(false);
  });

  it("runs the management TUI over the same safe core operations", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-tui-"));
    const result = await createProject({
      slug: "tui-check",
      directory: parent,
      apiOrigin: "https://api.tui-check.com",
    });
    await unlink(path.join(result.targetDirectory, ".spotkit.json"));
    const selections = [
      "overview",
      "doctor",
      "upgrade",
      "manifest",
      "origin",
      "exit",
    ];
    const shown: string[] = [];
    const io: TuiIO = {
      intro(message) {
        shown.push(`intro:${message}`);
      },
      outro(message) {
        shown.push(`outro:${message}`);
      },
      async select() {
        return selections.shift();
      },
      async confirm() {
        return true;
      },
      async text() {
        return "not-an-https-origin";
      },
      show(title, body) {
        shown.push(`${title}:${body}`);
      },
    };
    await expect(
      runTui({ directory: result.targetDirectory, io }),
    ).resolves.toBe(0);
    expect(shown.join("\n")).toContain("Tui Check overview");
    expect(shown.join("\n")).toContain("Doctor · 0 errors / 0 warnings");
    expect(shown.join("\n")).toContain("Upgrade · unmanaged → 0.7.0");
    expect(shown.join("\n")).toContain("Manifest synchronized");
    expect(shown.join("\n")).toContain("Action failed");
    await expect(
      synchronizeManifest({ directory: result.targetDirectory }),
    ).resolves.toMatchObject({ changed: false });
  });

  it("plans safe migrations for legacy project fixtures", async () => {
    const fixtures = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL("./fixtures/legacy-projects.json", import.meta.url),
        ),
        "utf8",
      ),
    ) as Array<{
      name: string;
      manifestVersion: string | null;
      removeRuntimeFile: string | null;
      modifyRuntimeFile: string | null;
      expectedState: "missing" | "modified";
    }>;
    for (const fixture of fixtures) {
      const parent = await mkdtemp(path.join(tmpdir(), "spotkit-legacy-"));
      const result = await createProject({
        slug: fixture.name,
        directory: parent,
        apiOrigin: "https://api.legacy.example.net",
      });
      const manifestFile = path.join(result.targetDirectory, ".spotkit.json");
      if (fixture.manifestVersion === null) {
        await unlink(manifestFile);
      } else {
        await writeFile(
          manifestFile,
          `${JSON.stringify(
            {
              $schema:
                "https://raw.githubusercontent.com/mathias7799/HubSpotLab/main/tools/spotkit/docs/spotkit-manifest.schema.json",
              schemaVersion: 1,
              createdWith: fixture.manifestVersion,
              updatedWith: fixture.manifestVersion,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
      }
      const relative = fixture.removeRuntimeFile ?? fixture.modifyRuntimeFile;
      if (!relative) throw new Error("Legacy fixture needs runtime drift.");
      const runtimeFile = path.join(
        result.targetDirectory,
        "packages/spotkit-runtime",
        relative,
      );
      if (fixture.removeRuntimeFile) await unlink(runtimeFile);
      else {
        await writeFile(
          runtimeFile,
          `${await readFile(runtimeFile, "utf8")}\n// Legacy customization.\n`,
          "utf8",
        );
      }
      const plan = await planUpgrade(result.targetDirectory);
      expect(plan.targetVersion).toBe("0.7.0");
      expect(plan.upgradeAvailable).toBe(true);
      expect(plan.runtimeDifferences).toContainEqual({
        file: relative,
        state: fixture.expectedState,
      });
      expect(plan.actions.join(" ")).toContain("will not overwrite");
    }
  });

  it("reports placeholder origins as warnings", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "sample-app",
      directory: parent,
    });
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.ok).toBe(true);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "placeholder-origin", level: "warning" }),
    );
  });

  it("fails projects whose permitted origin does not match OAuth", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "broken-app",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    const file = path.join(
      result.targetDirectory,
      "apps/hubspot/src/app/app-hsmeta.json",
    );
    const metadata = JSON.parse(await readFile(file, "utf8")) as {
      config: { permittedUrls: { fetch: string[] } };
    };
    metadata.config.permittedUrls.fetch = ["https://wrong.example.net"];
    await writeFile(file, JSON.stringify(metadata), "utf8");
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.ok).toBe(false);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "permitted-origin", level: "error" }),
    );
  });

  it("detects extension backend origins missing from permitted URLs", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "backend-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    await writeFile(
      path.join(
        result.targetDirectory,
        "apps/hubspot/src/app/pages/backend.ts",
      ),
      'export const API_ORIGIN = "https://wrong.example.net";\n',
      "utf8",
    );
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "backend-origin", level: "error" }),
    );
  });

  it("rejects unsafe project slugs", async () => {
    await expect(createProject({ slug: "Not Safe" })).rejects.toThrow(
      "Project slug",
    );
  });

  it("detects runtime and metadata configuration drift", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "drift-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    const file = path.join(result.targetDirectory, "services/api/.env.example");
    const content = await readFile(file, "utf8");
    await writeFile(
      file,
      content
        .replace(
          "PUBLIC_URL=https://api.example.net",
          "PUBLIC_URL=https://wrong.example.net",
        )
        .replace(
          "HUBSPOT_SCOPES=oauth crm.objects.deals.read",
          "HUBSPOT_SCOPES=oauth",
        )
        .replace(
          "ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=false",
          "ALLOW_UNSIGNED_DEVELOPMENT_REQUESTS=true",
        ),
      "utf8",
    );
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "public-url-mismatch",
          level: "error",
        }),
        expect.objectContaining({ code: "scope-mismatch", level: "error" }),
        expect.objectContaining({
          code: "unsigned-production-requests",
          level: "error",
        }),
      ]),
    );
  });

  it("warns when OAuth uses a temporary tunnel", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "tunnel-check",
      directory: parent,
      apiOrigin: "https://demo.ngrok-free.app",
    });
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.diagnostics).toContainEqual(
      expect.objectContaining({ code: "temporary-tunnel", level: "warning" }),
    );

    await synchronizeOrigin({
      directory: result.targetDirectory,
      origin: "https://preview.serveousercontent.com",
      write: true,
    });
    expect(
      (await diagnoseProject(result.targetDirectory)).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "temporary-tunnel", level: "warning" }),
    );
  });

  it("detects insecure production hosting assets", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "hosting-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    await writeFile(
      path.join(result.targetDirectory, "Dockerfile"),
      "FROM node:24\nCMD node src/adapters/node.ts\n",
      "utf8",
    );
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "hosting-security",
          level: "error",
          file: "Dockerfile",
        }),
      ]),
    );
  });

  it("requires custom-object scopes only when the optional recipe is enabled", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "object-storage-check",
      directory: parent,
      apiOrigin: "https://api.example.net",
    });
    const file = path.join(result.targetDirectory, "services/api/src/app.ts");
    await writeFile(
      file,
      `${await readFile(file, "utf8")}\n// createHubSpotConfigurationStore(context)\n`,
      "utf8",
    );
    const report = await diagnoseProject(result.targetDirectory);
    expect(report.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "object-storage-scopes",
          level: "error",
        }),
        expect.objectContaining({
          code: "object-storage-runtime-scopes",
          level: "error",
        }),
      ]),
    );
  });

  it("adds webhook and workflow-action features without overwriting", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "feature-check",
      directory: parent,
      displayName: "Feature Check",
      apiOrigin: "https://api.example.net",
    });
    const webhook = await addFeature({
      feature: "webhooks",
      directory: result.targetDirectory,
    });
    const workflow = await addFeature({
      feature: "workflow-action",
      directory: result.targetDirectory,
    });
    expect(webhook.filesCreated).toBe(4);
    expect(workflow.filesCreated).toBe(4);
    const app = await readFile(
      path.join(result.targetDirectory, "services/api/src/app.ts"),
      "utf8",
    );
    expect(app).toContain("handleHubSpotWebhooks");
    expect(app).toContain("handleExampleWorkflowAction");
    const webhookMetadata = JSON.parse(
      await readFile(
        path.join(
          result.targetDirectory,
          "apps/hubspot/src/app/webhooks/webhooks-hsmeta.json",
        ),
        "utf8",
      ),
    ) as { config: { settings: { targetUrl: string } } };
    expect(webhookMetadata.config.settings.targetUrl).toBe(
      "https://api.example.net/webhooks/hubspot",
    );
    expect((await diagnoseProject(result.targetDirectory)).errors).toBe(0);
    const workflowMetadataPath = path.join(
      result.targetDirectory,
      "apps/hubspot/src/app/workflow-actions/example-workflow-action-hsmeta.json",
    );
    const workflowMetadata = JSON.parse(
      await readFile(workflowMetadataPath, "utf8"),
    ) as { config: { actionUrl: string } };
    workflowMetadata.config.actionUrl =
      "https://api.example.net/workflow-actions/prepare-handoff";
    await writeFile(
      workflowMetadataPath,
      JSON.stringify(workflowMetadata),
      "utf8",
    );
    const workflowHandlerPath = path.join(
      result.targetDirectory,
      "services/api/src/features/workflow-action.ts",
    );
    await writeFile(
      workflowHandlerPath,
      (await readFile(workflowHandlerPath, "utf8"))
        .replaceAll(
          "handleExampleWorkflowAction",
          "handlePrepareHandoffWorkflowAction",
        )
        .replace(
          "/workflow-actions/example",
          "/workflow-actions/prepare-handoff",
        ),
      "utf8",
    );
    await writeFile(
      path.join(result.targetDirectory, "services/api/src/app.ts"),
      app.replaceAll(
        "handleExampleWorkflowAction",
        "handlePrepareHandoffWorkflowAction",
      ),
      "utf8",
    );
    expect((await diagnoseProject(result.targetDirectory)).errors).toBe(0);
    webhookMetadata.config.settings.targetUrl =
      "http://unsafe.example.net/hook";
    await writeFile(
      path.join(
        result.targetDirectory,
        "apps/hubspot/src/app/webhooks/webhooks-hsmeta.json",
      ),
      JSON.stringify(webhookMetadata),
      "utf8",
    );
    expect(
      (await diagnoseProject(result.targetDirectory)).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: "feature-target", level: "error" }),
    );
    await expect(
      addFeature({ feature: "webhooks", directory: result.targetDirectory }),
    ).rejects.toThrow("already installed");
    expect(normalizeFeature("workflow-actions")).toBe("workflow-action");
  });

  it("adds the gated app-object, association, and app-event recipes", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "crm-features-2026",
      directory: parent,
      displayName: "CRM Features",
      apiOrigin: "https://api.example.net",
    });
    await expect(
      addFeature({
        feature: "app-object-association",
        directory: result.targetDirectory,
      }),
    ).rejects.toThrow("before app-object-association");
    expect(
      (
        await addFeature({
          feature: "app-object",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(2);
    const objectMetadata = JSON.parse(
      await readFile(
        path.join(
          result.targetDirectory,
          "apps/hubspot/src/app/app-objects/spotkit-record-hsmeta.json",
        ),
        "utf8",
      ),
    ) as { config: { name: string } };
    expect(objectMetadata.config.name).toMatch(/^[A-Z]+(?:_[A-Z]+)*$/);
    expect(
      (
        await addFeature({
          feature: "app-object-association",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(2);
    expect(
      (
        await addFeature({
          feature: "app-event",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(4);
    expect(
      (
        await addFeature({
          feature: "agent-tool",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(4);
    expect((await diagnoseProject(result.targetDirectory)).errors).toBe(0);
    expect(normalizeFeature("app-events")).toBe("app-event");
    expect(normalizeFeature("agent-tools")).toBe("agent-tool");
    expect(await inspectProject(result.targetDirectory)).toMatchObject({
      name: "CRM Features",
      profile: "marketplace",
      platformVersion: "2026.03",
      apiOrigin: "https://api.example.net",
      appObjectCount: 1,
      errors: 0,
      warnings: 0,
      releaseReady: true,
      features: [
        "agent-tool",
        "app-event",
        "app-object",
        "app-object-association",
        "card",
        "page",
        "settings",
      ],
    });
  });

  it("creates a private-static profile with compatible functions and SCIM", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "identity-ops",
      directory: parent,
      displayName: "Identity Ops",
      profile: "private-static",
    });
    const metadata = JSON.parse(
      await readFile(
        path.join(
          result.targetDirectory,
          "apps/hubspot/src/app/app-hsmeta.json",
        ),
        "utf8",
      ),
    ) as { config: { distribution: string; auth: { type: string } } };
    expect(metadata.config).toMatchObject({
      distribution: "private",
      auth: { type: "static" },
    });
    expect(
      (
        await addFeature({
          feature: "app-function-endpoint",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(3);
    expect(
      (
        await addFeature({
          feature: "app-function-private",
          directory: result.targetDirectory,
        })
      ).filesCreated,
    ).toBe(3);
    expect(
      (await addFeature({ feature: "scim", directory: result.targetDirectory }))
        .filesCreated,
    ).toBe(2);
    expect((await diagnoseProject(result.targetDirectory)).errors).toBe(0);
    expect(await inspectProject(result.targetDirectory)).toMatchObject({
      profile: "private-static",
      features: ["app-function-endpoint", "app-function-private", "scim"],
      appObjectCount: 0,
      releaseReady: true,
    });
    await expect(
      addFeature({ feature: "app-event", directory: result.targetDirectory }),
    ).rejects.toThrow("OAuth marketplace");
  });

  it("previews and synchronizes every public API origin", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "origin-sync",
      directory: parent,
      apiOrigin: "https://old.example.net",
    });
    await addFeature({
      feature: "webhooks",
      directory: result.targetDirectory,
    });
    await addFeature({
      feature: "workflow-action",
      directory: result.targetDirectory,
    });
    await addFeature({
      feature: "agent-tool",
      directory: result.targetDirectory,
    });
    const appFile = path.join(
      result.targetDirectory,
      "apps/hubspot/src/app/app-hsmeta.json",
    );
    const before = await readFile(appFile, "utf8");
    const preview = await synchronizeOrigin({
      directory: result.targetDirectory,
      origin: "https://new.example.net",
    });
    expect(preview.written).toBe(false);
    expect(preview.changes.length).toBeGreaterThanOrEqual(6);
    expect(await readFile(appFile, "utf8")).toBe(before);

    await synchronizeOrigin({
      directory: result.targetDirectory,
      origin: "https://new.example.net",
      write: true,
    });
    expect(await readFile(appFile, "utf8")).toContain(
      "https://new.example.net/oauth/callback",
    );
    expect(
      await readFile(
        path.join(
          result.targetDirectory,
          "apps/hubspot/src/app/webhooks/webhooks-hsmeta.json",
        ),
        "utf8",
      ),
    ).toContain("https://new.example.net/webhooks/hubspot");
    expect((await diagnoseProject(result.targetDirectory)).errors).toBe(0);
    await expect(
      synchronizeOrigin({
        directory: result.targetDirectory,
        origin: "http://unsafe.example.net",
        write: true,
      }),
    ).rejects.toThrow("HTTPS origin");
  });

  it("prepares coordinated API and HubSpot development without side effects", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "dev-check",
      directory: parent,
      apiOrigin: "https://old.example.net",
    });
    const metadataFile = path.join(
      result.targetDirectory,
      "apps/hubspot/src/app/app-hsmeta.json",
    );
    const before = await readFile(metadataFile, "utf8");
    await writeFile(
      path.join(result.targetDirectory, "services/api/.env"),
      "PUBLIC_URL=https://old.example.net\nHUBSPOT_CLIENT_ID=test\n",
      "utf8",
    );
    const plan = await prepareDevelopment({
      directory: result.targetDirectory,
      origin: "https://dev.example.net",
      check: true,
    });
    expect(plan.commands.map((command) => command.label)).toEqual([
      "API",
      "HubSpot",
    ]);
    expect(plan.originChanges.length).toBeGreaterThan(0);
    expect(await readFile(metadataFile, "utf8")).toBe(before);
    expect(
      (
        await prepareDevelopment({
          directory: result.targetDirectory,
          apiOnly: true,
        })
      ).commands,
    ).toHaveLength(1);
  });

  it("extracts public origins from Cloudflare and ngrok logs", () => {
    expect(
      extractTunnelOrigin(
        "cloudflare",
        "INF Your quick Tunnel has been created! https://kind-moon.trycloudflare.com",
      ),
    ).toBe("https://kind-moon.trycloudflare.com");
    expect(
      extractTunnelOrigin(
        "ngrok",
        '{"msg":"started tunnel","url":"https://demo-123.ngrok-free.app"}',
      ),
    ).toBe("https://demo-123.ngrok-free.app");
  });

  it("preflights an installed tunnel provider without starting it", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "tunnel-preflight",
      directory: parent,
    });
    await writeFile(
      path.join(result.targetDirectory, "services/api/.env"),
      "PUBLIC_URL=https://example.test\n",
      "utf8",
    );
    const binaryDirectory = await mkdtemp(path.join(tmpdir(), "spotkit-bin-"));
    const binary = path.join(binaryDirectory, "cloudflared");
    await writeFile(binary, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(binary, 0o755);
    const previousPath = process.env.PATH;
    process.env.PATH = `${binaryDirectory}${path.delimiter}${previousPath ?? ""}`;
    try {
      const plan = await prepareTunnelDevelopment({
        directory: result.targetDirectory,
        provider: "cloudflare",
        check: true,
      });
      expect(plan.command).toMatchObject({
        command: "cloudflared",
        args: expect.arrayContaining(["tunnel", "--no-autoupdate"]),
      });
    } finally {
      process.env.PATH = previousPath;
    }
  });

  it("derives a reviewable OAuth reconnect URL", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "reconnect-check",
      directory: parent,
      apiOrigin: "https://reconnect.example.net",
    });
    await expect(oauthReconnectUrl(result.targetDirectory)).resolves.toBe(
      "https://reconnect.example.net/oauth/install?returnTo=%2Finstalled",
    );
  });

  it("blocks secrets and reserved deployment origins before release", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "spotkit-"));
    const result = await createProject({
      slug: "release-check",
      directory: parent,
      apiOrigin: "https://api.release-check.com",
    });
    expect((await checkRelease({ directory: result.targetDirectory })).ok).toBe(
      true,
    );
    const source = path.join(
      result.targetDirectory,
      "services/api/src/leak.ts",
    );
    await writeFile(
      source,
      'export const leaked = "pat-eu1-abcdefghijklmnopqrstuvwxyz123456";\n',
      "utf8",
    );
    const report = await checkRelease({ directory: result.targetDirectory });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "secret",
        file: "services/api/src/leak.ts",
      }),
    );
    await expect(
      uploadHubSpotProject({
        directory: result.targetDirectory,
        confirm: false,
      }),
    ).rejects.toThrow("--confirm");
  });

  it("smoke-tests deployed security and OAuth boundaries", async () => {
    const mockFetch = (async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path === "/health") return Response.json({ ok: true });
      if (path === "/installed") {
        return new Response("connected", {
          headers: {
            "Content-Security-Policy": "default-src 'none'",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return new Response(null, {
        status: 302,
        headers: {
          Location:
            "https://app.hubspot.com/oauth/authorize?client_id=test&state=signed",
          "Set-Cookie":
            "spotkit_state=signed; HttpOnly; Secure; SameSite=Lax; Path=/oauth",
        },
      });
    }) as typeof fetch;
    const report = await smokeApplication(
      "https://api.release-check.com",
      mockFetch,
    );
    expect(report.ok).toBe(true);
    expect(report.checks).toHaveLength(3);
  });

  it("normalizes screenshots and deterministically refreshes documentation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "spotkit-docs-"));
    const source = path.join(root, "captured.png");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const endOffset = png.indexOf(Buffer.from("IEND")) - 4;
    const privateText = Buffer.concat([
      Buffer.from([0, 0, 0, 13]),
      Buffer.from("tEXtSecret=portal"),
      Buffer.alloc(4),
    ]);
    await writeFile(
      source,
      Buffer.concat([
        png.subarray(0, endOffset),
        privateText,
        png.subarray(endOffset),
      ]),
    );
    const preview = await refreshDocumentation({
      directory: root,
      screenshots: [{ label: "Deal overview", file: source }],
    });
    expect(preview.changed).toBe(true);
    expect(preview.written).toBe(false);
    const written = await refreshDocumentation({
      directory: root,
      screenshots: [{ label: "Deal overview", file: source }],
      write: true,
    });
    expect(written.assets).toEqual([
      expect.objectContaining({
        label: "Deal overview",
        file: "deal-overview.png",
        width: 1,
        height: 1,
      }),
    ]);
    expect(
      await readFile(path.join(root, "docs/screenshots/README.md"), "utf8"),
    ).toContain("![Deal overview](./deal-overview.png)");
    expect(
      await readFile(path.join(root, "docs/screenshots/deal-overview.png")),
    ).not.toContain(Buffer.from("Secret=portal"));
    expect(
      await refreshDocumentation({
        directory: root,
        screenshots: [{ label: "Deal overview", file: source }],
      }),
    ).toMatchObject({ changed: false, written: false });
  });
});
