import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface DocumentationScreenshot {
  label: string;
  file: string;
}

export interface RefreshDocumentationOptions {
  directory?: string;
  screenshots: DocumentationScreenshot[];
  write?: boolean;
}

export interface DocumentationAsset {
  label: string;
  file: string;
  width: number;
  height: number;
  sha256: string;
}

export interface RefreshDocumentationResult {
  root: string;
  changed: boolean;
  written: boolean;
  files: string[];
  assets: DocumentationAsset[];
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PRIVATE_CHUNKS = new Set(["eXIf", "iTXt", "tEXt", "tIME", "zTXt"]);

export async function refreshDocumentation(
  options: RefreshDocumentationOptions,
): Promise<RefreshDocumentationResult> {
  if (options.screenshots.length === 0) {
    throw new Error("At least one --screenshot <label=png-path> is required.");
  }
  const root = path.resolve(options.directory ?? ".");
  const targetDirectory = path.join(root, "docs/screenshots");
  const names = new Set<string>();
  const rendered: Array<DocumentationAsset & { content: Buffer }> = [];
  for (const screenshot of options.screenshots) {
    const name = slug(screenshot.label);
    if (names.has(name)) {
      throw new Error(`Screenshot labels must be unique: ${screenshot.label}`);
    }
    names.add(name);
    const source = path.resolve(screenshot.file);
    const normalized = sanitizePng(await readFile(source));
    const dimensions = pngDimensions(normalized);
    rendered.push({
      label: screenshot.label.trim(),
      file: `${name}.png`,
      ...dimensions,
      sha256: createHash("sha256").update(normalized).digest("hex"),
      content: normalized,
    });
  }
  rendered.sort((left, right) => left.file.localeCompare(right.file));
  const assets = rendered.map(({ content: _, ...asset }) => asset);
  const outputs = new Map<string, Buffer>();
  for (const asset of rendered) {
    outputs.set(asset.file, asset.content);
  }
  outputs.set(
    "manifest.json",
    Buffer.from(`${JSON.stringify({ assets }, null, 2)}\n`),
  );
  outputs.set("README.md", Buffer.from(gallery(assets)));

  const changedFiles: string[] = [];
  for (const [file, content] of outputs) {
    const absolute = path.join(targetDirectory, file);
    const previous = await readFile(absolute).catch(() => undefined);
    if (!previous?.equals(content))
      changedFiles.push(`docs/screenshots/${file}`);
  }
  const write = options.write ?? false;
  if (write && changedFiles.length > 0) {
    await mkdir(targetDirectory, { recursive: true });
    for (const [file, content] of outputs) {
      await writeFile(path.join(targetDirectory, file), content);
    }
  }
  return {
    root,
    changed: changedFiles.length > 0,
    written: write && changedFiles.length > 0,
    files: changedFiles,
    assets,
  };
}

function sanitizePng(input: Buffer): Buffer {
  if (!input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Documentation screenshots must be PNG files.");
  }
  if (input.byteLength > 20 * 1024 * 1024) {
    throw new Error("Documentation screenshots must be 20 MB or smaller.");
  }
  const chunks: Buffer[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  let sawHeader = false;
  let sawEnd = false;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > input.length) throw new Error("PNG contains a truncated chunk.");
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (type === "IHDR") sawHeader = true;
    if (!PRIVATE_CHUNKS.has(type)) chunks.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
  }
  if (!sawHeader || !sawEnd) throw new Error("PNG is missing required chunks.");
  return Buffer.concat(chunks);
}

function pngDimensions(input: Buffer): { width: number; height: number } {
  const width = input.readUInt32BE(16);
  const height = input.readUInt32BE(20);
  if (width === 0 || height === 0 || width > 10_000 || height > 10_000) {
    throw new Error(
      `PNG dimensions are not suitable for documentation: ${width}x${height}.`,
    );
  }
  return { width, height };
}

function slug(value: string): string {
  const result = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!result)
    throw new Error("Screenshot labels must contain a letter or number.");
  return result;
}

function gallery(assets: DocumentationAsset[]): string {
  const sections = assets
    .map(
      (asset) =>
        `## ${escapeMarkdown(asset.label)}\n\n![${escapeMarkdown(asset.label)}](./${asset.file})\n`,
    )
    .join("\n");
  return `# Product screenshots\n\nThese screenshots are normalized and indexed by SpotKit. Refresh them with the\ncommand documented in the project README; review every image for customer data\nbefore committing it.\n\n${sections}`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\[\]]/g, "\\$&");
}
