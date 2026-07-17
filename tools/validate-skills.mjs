import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../skills",
);
const errors = [];
const skills = [];

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(root, entry.name);
  if (await exists(path.join(directory, "SKILL.md"))) {
    skills.push({ name: entry.name, directory });
  }
}

if (skills.length === 0)
  errors.push("No skill directories containing SKILL.md were found.");

for (const skill of skills) await validateSkill(skill);

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL ${error}`);
  process.exitCode = 1;
} else {
  for (const skill of skills) console.log(`PASS ${skill.name}`);
  console.log(`${skills.length} skill(s) valid.`);
}

async function validateSkill(skill) {
  const source = await readFile(path.join(skill.directory, "SKILL.md"), "utf8");
  const frontmatter = source.match(
    /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/,
  )?.[1];
  if (!frontmatter) {
    fail(skill, "SKILL.md needs YAML frontmatter.");
    return;
  }
  const fields = new Map();
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([a-z][a-z0-9_-]*):\s*(.+)$/);
    if (match) fields.set(match[1], match[2].replace(/^['"]|['"]$/g, ""));
  }
  if (fields.size !== 2 || !fields.has("name") || !fields.has("description")) {
    fail(skill, "frontmatter must contain only name and description.");
  }
  if (fields.get("name") !== skill.name) {
    fail(skill, `frontmatter name must match directory '${skill.name}'.`);
  }
  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name) ||
    skill.name.length > 64
  ) {
    fail(
      skill,
      "name must be lowercase hyphen-case and at most 64 characters.",
    );
  }
  const description = fields.get("description") ?? "";
  if (description.length < 40 || /TODO|\[TODO/i.test(description)) {
    fail(
      skill,
      "description must be complete and specific enough to trigger the skill.",
    );
  }
  if (source.split(/\r?\n/).length > 500) {
    fail(skill, "SKILL.md must remain under 500 lines.");
  }
  for (const forbidden of [
    "README.md",
    "CHANGELOG.md",
    "INSTALLATION_GUIDE.md",
    "QUICK_REFERENCE.md",
  ]) {
    if (await exists(path.join(skill.directory, forbidden))) {
      fail(
        skill,
        `${forbidden} is auxiliary documentation and does not belong inside a skill.`,
      );
    }
  }
  const agentFile = path.join(skill.directory, "agents/openai.yaml");
  if (!(await exists(agentFile))) {
    fail(skill, "agents/openai.yaml is required for discoverable UI metadata.");
  } else {
    const agent = await readFile(agentFile, "utf8");
    for (const field of [
      "display_name",
      "short_description",
      "default_prompt",
    ]) {
      if (!new RegExp(`^\\s*${field}:\\s*".+"`, "m").test(agent)) {
        fail(skill, `agents/openai.yaml must define quoted ${field}.`);
      }
    }
    if (!agent.includes(`$${skill.name}`)) {
      fail(skill, `default_prompt must explicitly invoke $${skill.name}.`);
    }
  }
  for (const target of markdownTargets(source)) {
    const absolute = path.resolve(skill.directory, target);
    if (
      !absolute.startsWith(`${skill.directory}${path.sep}`) ||
      !(await exists(absolute))
    ) {
      fail(skill, `SKILL.md links to a missing or unsafe resource: ${target}`);
    }
  }
}

function markdownTargets(source) {
  return [...source.matchAll(/\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter(
      (target) =>
        !target.startsWith("#") &&
        !target.startsWith("https://") &&
        !target.startsWith("http://"),
    );
}

function fail(skill, message) {
  errors.push(`${skill.name}: ${message}`);
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
