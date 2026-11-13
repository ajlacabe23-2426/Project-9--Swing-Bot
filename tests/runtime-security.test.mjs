import test from 'node:test';
import assert from 'node:assert/strict';
import {isPatchedNodeRuntime, assertPatchedNodeRuntime} from '../src/runtime-security.mjs';

test('accepts supported patched Node release lines at their security floors', () => {
  for (const version of ['22.23.5', 'v22.23.6', '24.22.3', '24.23.0', '26.13.1', '26.14.0']) {
    assert.equal(isPatchedNodeRuntime(version), true, version);
    assert.doesNotThrow(() => assertPatchedNodeRuntime(version));
  }
});

test('rejects old patches, other release lines, and malformed versions', () => {
  for (const version of ['22.23.4', '24.22.2', '26.13.0', '20.20.2', '23.99.99', '25.1.0', '27.0.0', '', '22.23', 'v24.22.2-extra', null]) {
    assert.equal(isPatchedNodeRuntime(version), false, String(version));
    assert.throws(() => assertPatchedNodeRuntime(version), /security-patched Node.js runtime/);
  }
});
