import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const failures = [];

function fail(message) {
  failures.push(message);
}

function readTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  if (result.status !== 0) {
    console.error("Repository baseline could not enumerate tracked files.");
    process.exit(2);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function isAllowedExampleEnvironmentFile(file) {
  return /(?:^|\/)\.env(?:\.[^/]+)?\.example$/i.test(file) ||
    /(?:^|\/)\.env\.example$/i.test(file);
}

function auditTrackedFileNames(files) {
  const privateKeyLike = /(?:^|\/)(?:id_rsa|id_ed25519)(?:\.|$)|\.(?:pem|key|p12|pfx)$/i;
  const environmentLike = /(?:^|\/)\.env(?:\.[^/]+)?$/i;
  for (const file of files) {
    const normalized = file.replaceAll("\\", "/");
    if (privateKeyLike.test(normalized)) {
      fail(`Tracked secret-like key material is not allowed: ${normalized}`);
    }
    if (environmentLike.test(normalized) && !isAllowedExampleEnvironmentFile(normalized)) {
      fail(`Tracked environment file is not allowed: ${normalized}`);
    }
  }
}

function auditTopLevelPermissions(source, display) {
  const lines = source.split(/\r?\n/);
  const index = lines.findIndex((line) => /^permissions\s*:\s*$/.test(line));
  if (index < 0) {
    fail(`${display} must declare explicit top-level permissions.`);
    return;
  }
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    if (!/^\s+/.test(line)) break;
    if (/^\s+[A-Za-z0-9_-]+\s*:\s*write\s*(?:#.*)?$/i.test(line)) {
      fail(`${display} grants a write GitHub token permission: ${line.trim()}`);
    }
  }
}

function auditWorkflow(file) {
  const source = fs.readFileSync(file, "utf8");
  const display = file.replaceAll("\\", "/");

  if (/^\s*pull_request_target\s*:/m.test(source)) {
    fail(`${display} uses pull_request_target, which is prohibited.`);
  }
  if (/^\s*permissions\s*:\s*write-all\s*$/m.test(source)) {
    fail(`${display} grants permissions: write-all.`);
  }

  auditTopLevelPermissions(source, display);

  const usesPattern = /^\s*uses:\s*([^\s#]+)\s*(?:#.*)?$/gm;
  for (const match of source.matchAll(usesPattern)) {
    const action = match[1];
    if (action.startsWith("./")) continue;
    const at = action.lastIndexOf("@");
    const ref = at >= 0 ? action.slice(at + 1) : "";
    if (!/^[0-9a-f]{40}$/i.test(ref)) {
      fail(`${display} uses an unpinned remote action: ${action}`);
    }
  }

  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/uses:\s*actions\/checkout@[0-9a-f]{40}/i.test(lines[index])) continue;
    const nearby = lines.slice(index + 1, index + 12).join("\n");
    if (!/persist-credentials:\s*false/i.test(nearby)) {
      fail(`${display} checkout must set persist-credentials: false.`);
    }
  }
}

function auditWorkflows(files) {
  const workflows = files.filter((file) =>
    /^\.github\/workflows\/.*\.ya?ml$/i.test(file.replaceAll("\\", "/")),
  );
  if (workflows.length === 0) {
    fail("No tracked GitHub Actions workflows were found.");
    return;
  }
  for (const workflow of workflows) auditWorkflow(path.resolve(workflow));
}

function auditRequiredSecurityFiles(files) {
  const required = [
    ".github/dependabot.yml",
    ".github/workflows/security-monitor.yml",
    "SECURITY.md",
    "scripts/security/scan-git-history.mjs",
    "scripts/security/check-repository-baseline.mjs",
  ];
  for (const requiredFile of required) {
    if (!files.includes(requiredFile)) fail(`Required security control is missing: ${requiredFile}`);
  }

  const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
  if (packageJson.scripts?.["security:secrets"] !== "node scripts/security/scan-git-history.mjs") {
    fail("package.json must expose the expected security:secrets command.");
  }
  if (packageJson.scripts?.["security:baseline"] !== "node scripts/security/check-repository-baseline.mjs") {
    fail("package.json must expose the expected security:baseline command.");
  }

  const hasDependencies =
    Object.keys(packageJson.dependencies ?? {}).length > 0 ||
    Object.keys(packageJson.devDependencies ?? {}).length > 0;
  if (hasDependencies && !files.includes("package-lock.json")) {
    fail("Projects with npm dependencies must track package-lock.json before promotion.");
  }

  const dependabot = fs.readFileSync(".github/dependabot.yml", "utf8");
  for (const ecosystem of ["npm", "github-actions"]) {
    if (!new RegExp(`package-ecosystem:\\s*["']?${ecosystem}["']?`).test(dependabot)) {
      fail(`Dependabot coverage is missing for ${ecosystem}.`);
    }
  }
}

const trackedFiles = readTrackedFiles();
auditTrackedFileNames(trackedFiles);
auditWorkflows(trackedFiles);
auditRequiredSecurityFiles(trackedFiles);

if (failures.length > 0) {
  console.error("Repository security baseline failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Repository security baseline passed: ${trackedFiles.length} tracked files checked.`);
