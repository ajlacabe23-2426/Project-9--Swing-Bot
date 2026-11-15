// Fail closed on Node.js versions predating the November 2026 security releases.
// This module is deliberately dependency-free and does not interact with market or paper data.
const floors = new Map([
  [22, [22, 23, 5]],
  [24, [24, 22, 3]],
  [26, [26, 13, 1]]
]);

export function isPatchedNodeRuntime(version) {
  const match = typeof version === 'string' && /^(?:v)?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  const minimum = floors.get(major);
  if (!minimum) return false;
  return minor > minimum[1] || (minor === minimum[1] && patch >= minimum[2]);
}

export function assertPatchedNodeRuntime(version = process.versions.node) {
  if (!isPatchedNodeRuntime(version)) {
    throw new Error(
      'Project 9 local workstation requires a security-patched Node.js runtime: ' +
      '22.23.5+ (22.x), 24.22.3+ (24.x), or 26.13.1+ (26.x). ' +
      'Detected ' + JSON.stringify(version) + '. Update Node.js before starting the workstation.'
    );
  }
}
