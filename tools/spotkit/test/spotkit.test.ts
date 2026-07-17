import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createProject } from "../src/create.js";
import { diagnoseProject } from "../src/doctor.js";

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
});
