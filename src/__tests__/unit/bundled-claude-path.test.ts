import { after, before, beforeEach, afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

const isWindows = process.platform === 'win32';
const exe = isWindows ? 'claude.exe' : 'claude';

const TEST_ROOT = path.join(os.tmpdir(), `codepilot-bundled-claude-${Date.now()}`);

describe('getBundledClaudePath / classifyClaudePath / getUpgradeCommand', () => {
  let platformLib: typeof import('../../lib/platform');
  let originalCwd: () => string;
  let originalResourcesPath: string | undefined;

  before(async () => {
    fs.mkdirSync(TEST_ROOT, { recursive: true });
    originalCwd = process.cwd;
    originalResourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath;

    platformLib = await import(path.resolve(__dirname, '../../lib/platform.ts'));
  });

  after(() => {
    fs.rmSync(TEST_ROOT, { recursive: true, force: true });
    process.cwd = originalCwd;
    (process as unknown as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
  });

  beforeEach(() => {
    // Reset to a known-empty state so each test sets up the exact layout it needs.
    (process as unknown as { resourcesPath?: string }).resourcesPath = undefined;
    process.cwd = originalCwd;
  });

  afterEach(() => {
    (process as unknown as { resourcesPath?: string }).resourcesPath = originalResourcesPath;
    process.cwd = originalCwd;
  });

  it('returns undefined when neither prod nor dev paths exist', () => {
    process.cwd = () => path.join(TEST_ROOT, 'no-vendor');
    fs.mkdirSync(process.cwd(), { recursive: true });

    const result = platformLib.getBundledClaudePath();
    assert.equal(result, undefined);
  });

  it('returns the dev path when vendor/claude-code/<exe> exists', () => {
    const devRoot = path.join(TEST_ROOT, 'dev-mode');
    const vendorDir = path.join(devRoot, 'vendor', 'claude-code');
    fs.mkdirSync(vendorDir, { recursive: true });
    const expectedPath = path.join(vendorDir, exe);
    fs.writeFileSync(expectedPath, '#!/bin/sh\necho "fake claude"\n');

    process.cwd = () => devRoot;

    const result = platformLib.getBundledClaudePath();
    assert.equal(result, expectedPath);
  });

  it('returns the resourcesPath copy in production over the dev path', () => {
    const devRoot = path.join(TEST_ROOT, 'mixed-mode');
    const vendorDir = path.join(devRoot, 'vendor', 'claude-code');
    fs.mkdirSync(vendorDir, { recursive: true });
    fs.writeFileSync(path.join(vendorDir, exe), 'dev binary');

    const resPath = path.join(TEST_ROOT, 'mixed-mode-Resources');
    const claudeDir = path.join(resPath, 'claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const prodBin = path.join(claudeDir, exe);
    fs.writeFileSync(prodBin, 'prod binary');

    process.cwd = () => devRoot;
    (process as unknown as { resourcesPath?: string }).resourcesPath = resPath;

    const result = platformLib.getBundledClaudePath();
    assert.equal(result, prodBin);
  });

  it('ignores empty / sentinel resourcesPath values like "/" or ""', () => {
    const devRoot = path.join(TEST_ROOT, 'sentinel');
    const vendorDir = path.join(devRoot, 'vendor', 'claude-code');
    fs.mkdirSync(vendorDir, { recursive: true });
    const expectedPath = path.join(vendorDir, exe);
    fs.writeFileSync(expectedPath, 'dev only');

    process.cwd = () => devRoot;
    (process as unknown as { resourcesPath?: string }).resourcesPath = '/';

    const result = platformLib.getBundledClaudePath();
    assert.equal(result, expectedPath);
  });

  it('classifies /Resources/claude/ paths as bundled', () => {
    const sample = '/Applications/CodePilot.app/Contents/Resources/claude/claude';
    assert.equal(platformLib.classifyClaudePath(sample), 'bundled');
  });

  it('classifies vendor/claude-code/ paths as bundled (dev)', () => {
    const sample = '/Users/alice/Code/CodePilot/vendor/claude-code/claude';
    assert.equal(platformLib.classifyClaudePath(sample), 'bundled');
  });

  it('still classifies user installs separately', () => {
    assert.equal(platformLib.classifyClaudePath('/opt/homebrew/bin/claude'), 'homebrew');
    assert.equal(platformLib.classifyClaudePath('/Users/alice/.local/bin/claude'), 'native');
    assert.equal(platformLib.classifyClaudePath('/Users/alice/.bun/bin/claude'), 'bun');
  });

  it('getUpgradeCommand returns a no-op shape for the bundled type', () => {
    const cmd = platformLib.getUpgradeCommand('bundled');
    // Bundled Claude Code is shipped inside CodePilot — there is no upgrade
    // path here; the command should not actually mutate state. We assert the
    // shape rather than the exact tokens so future refactors stay safe.
    assert.equal(typeof cmd.command, 'string');
    assert.ok(Array.isArray(cmd.args));
    assert.equal(cmd.shell, false);
    assert.notEqual(cmd.command, 'brew');
    assert.notEqual(cmd.command, 'npm');
    assert.notEqual(cmd.command, 'bun');
  });
});
