import { spawnSync } from "node:child_process";

const rules = [
  ["GitHub classic token", "gh[pousr]_[A-Za-z0-9]{30,}"],
  ["GitHub fine-grained token", "github_pat_[A-Za-z0-9_]{40,}"],
  ["Supabase secret key", "sb_secret_[A-Za-z0-9_-]{20,}"],
  ["Stripe live secret", "sk_live_[A-Za-z0-9]{16,}"],
  ["OpenAI project secret", "sk-proj-[A-Za-z0-9_-]{20,}"],
  ["Anthropic API key", "sk-ant-api03-[A-Za-z0-9_-]{20,}"],
  ["private key", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"],
  ["credentialed Postgres URL", "postgres(ql)?://[^[:space:]@]+:[^[:space:]@]+@"],
];

const revs = spawnSync("git", ["rev-list", "--all"], { encoding: "utf8" });
if (revs.status !== 0) {
  console.error("Secret scan could not enumerate Git history.");
  process.exit(2);
}

const commits = revs.stdout.trim().split(/\s+/).filter(Boolean);
if (commits.length === 0) {
  console.error("Secret scan found no reachable commits.");
  process.exit(2);
}

const findings = [];
for (const [name, pattern] of rules) {
  for (const commit of commits) {
    const result = spawnSync(
      "git",
      ["grep", "-I", "-q", "-E", "-e", pattern, commit, "--", "."],
      { stdio: "ignore" },
    );
    if (result.status === 0) {
      findings.push({ name, commit });
      break;
    }
    if (result.status !== 1) {
      console.error(`Secret scan failed while checking ${name}.`);
      process.exit(2);
    }
  }
}

if (findings.length > 0) {
  console.error("Potential credential material exists in reachable Git history.");
  for (const finding of findings) {
    console.error(`- ${finding.name}: candidate found in commit ${finding.commit.slice(0, 12)}`);
  }
  console.error("Values are intentionally suppressed. Review and rotate/revoke before promotion.");
  process.exit(1);
}

console.log(
  `Secret-history scan passed: ${commits.length} reachable commits checked across ${rules.length} high-confidence credential classes.`,
);
