import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolRoot = fileURLToPath(new URL("..", import.meta.url));
const repositoryRoot = path.resolve(toolRoot, "../..");
const source = path.join(repositoryRoot, "packages/spotkit-runtime");
const destination = path.join(toolRoot, "runtime");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of [
  "package.json",
  "README.md",
  "tsconfig.json",
  "src",
  "test",
]) {
  await cp(path.join(source, name), path.join(destination, name), {
    recursive: true,
  });
}
