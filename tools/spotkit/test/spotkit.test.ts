import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createProject } from "../src/create.js";
import { diagnoseProject } from "../src/doctor.js";
import { addFeature, normalizeFeature } from "../src/features.js";

describe("SpotKit", () => {
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
  });
});
