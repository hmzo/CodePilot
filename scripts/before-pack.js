/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * electron-builder beforePack hook.
 *
 * Runs once per architecture *before* electron-builder copies extraResources
 * into the app bundle. We use it to fetch the Claude Code native binary
 * matching the target platform/arch directly from the npm registry, dropping
 * it into vendor/claude-code/ so the subsequent extraResources copy picks
 * it up.
 *
 * Cross-arch builds work because we always overwrite vendor/ with the right
 * tarball contents — the fetcher's stamp file (.claude-code-version) is keyed
 * by `${platformKey}@${version}` so changing arch forces a refetch.
 */
const path = require('path');
const { execFileSync } = require('child_process');

// electron-builder Arch enum:
//   ia32 = 0, x64 = 1, armv7l = 2, arm64 = 3, universal = 4
const ARCH_MAP = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
};

// platform.name in electron-builder is 'mac' | 'windows' | 'linux'.
// The Claude Code package keys use 'darwin' | 'win32' | 'linux'.
const PLATFORM_MAP = {
  mac: 'darwin',
  windows: 'win32',
  linux: 'linux',
};

module.exports = async function beforePack(context) {
  const platformName = context.packager.platform.name;
  const platform = PLATFORM_MAP[platformName];
  const arch = ARCH_MAP[context.arch];

  if (!platform) {
    console.warn(`[beforePack] Unknown packager platform: ${platformName}`);
    return;
  }
  if (!arch) {
    console.warn(`[beforePack] Unknown packager arch enum: ${context.arch}`);
    return;
  }

  // Map electron-builder's arch hints to Claude Code's PLATFORMS keys.
  //
  // Caveat: the Claude Code wrapper distinguishes glibc (linux-x64) from musl
  // (linux-x64-musl). electron-builder doesn't carry a libc hint, so we default
  // to glibc — override via env var CODEPILOT_CLAUDE_LIBC=musl on a musl host
  // (e.g. Alpine CI). All current CI runners are glibc.
  let archKey = arch;
  if (platform === 'linux' && process.env.CODEPILOT_CLAUDE_LIBC === 'musl') {
    archKey = `${arch}-musl`;
  }

  const fetcher = path.join(__dirname, 'fetch-claude-binary.js');
  console.log(`[beforePack] Fetching Claude Code binary for ${platform}-${archKey}...`);

  try {
    execFileSync(
      process.execPath,
      [fetcher, `--platform=${platform}`, `--arch=${archKey}`],
      {
        stdio: 'inherit',
        timeout: 5 * 60_000,
      }
    );
  } catch (err) {
    console.error('[beforePack] fetch-claude-binary.js failed:', err.message);
    throw new Error(
      `Could not bundle Claude Code binary for ${platform}-${archKey}. ` +
      `See above for details.`
    );
  }
};
