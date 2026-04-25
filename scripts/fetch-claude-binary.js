#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Fetch the @anthropic-ai/claude-code-{platform}-{arch} native binary tarball
 * directly from the npm registry, verify its integrity, and extract the
 * `claude` executable into vendor/claude-code/.
 *
 * This script supports cross-platform builds: when packaging an x64 DMG on
 * an arm64 host, npm install would install the host's optional dependency,
 * not the target platform's. Pulling the tarball directly avoids that.
 *
 * Usage:
 *   node scripts/fetch-claude-binary.js                          # uses host platform/arch
 *   node scripts/fetch-claude-binary.js --platform=darwin --arch=arm64
 *   node scripts/fetch-claude-binary.js --platform=win32 --arch=x64
 *   node scripts/fetch-claude-binary.js --platform=linux --arch=x64-musl
 *
 * The platform/arch keys mirror @anthropic-ai/claude-code/install.cjs PLATFORMS.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');
const zlib = require('zlib');

const REGISTRY = 'https://registry.npmjs.org';
const PACKAGE_PREFIX = '@anthropic-ai/claude-code';

// Mirror of PLATFORMS table in @anthropic-ai/claude-code/install.cjs (v2.1.119).
// Keys: `${platform}-${arch}` (with optional `-musl` suffix for linux).
// Values: { pkg, bin } — pkg is the optionalDependency npm name, bin is the
// file inside the tarball at package/<bin>.
const PLATFORMS = {
  'darwin-arm64': { pkg: PACKAGE_PREFIX + '-darwin-arm64', bin: 'claude' },
  'darwin-x64': { pkg: PACKAGE_PREFIX + '-darwin-x64', bin: 'claude' },
  'linux-x64': { pkg: PACKAGE_PREFIX + '-linux-x64', bin: 'claude' },
  'linux-arm64': { pkg: PACKAGE_PREFIX + '-linux-arm64', bin: 'claude' },
  'linux-x64-musl': { pkg: PACKAGE_PREFIX + '-linux-x64-musl', bin: 'claude' },
  'linux-arm64-musl': { pkg: PACKAGE_PREFIX + '-linux-arm64-musl', bin: 'claude' },
  'win32-x64': { pkg: PACKAGE_PREFIX + '-win32-x64', bin: 'claude.exe' },
  'win32-arm64': { pkg: PACKAGE_PREFIX + '-win32-arm64', bin: 'claude.exe' },
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) {
      out[m[1]] = m[2];
      continue;
    }
    const flag = arg.match(/^--(.+)$/);
    if (flag) {
      out[flag[1]] = true;
    }
  }
  return out;
}

function detectMusl() {
  if (process.platform !== 'linux') return false;
  const report =
    typeof process.report?.getReport === 'function'
      ? process.report.getReport()
      : null;
  return report != null && report.header?.glibcVersionRuntime === undefined;
}

/**
 * Resolve `${platform}-${arch}` for the host machine, mirroring the wrapper
 * package's getPlatformKey() logic.
 */
function detectHostPlatformKey() {
  const platform = process.platform;
  let cpu = os.arch();
  if (platform === 'linux') {
    return 'linux-' + cpu + (detectMusl() ? '-musl' : '');
  }
  // Rosetta 2 — prefer arm64 binary even if Node reports x64
  if (platform === 'darwin' && cpu === 'x64') {
    try {
      const r = spawnSync('sysctl', ['-n', 'sysctl.proc_translated'], {
        encoding: 'utf8',
        timeout: 1000,
      });
      if (r.stdout?.trim() === '1') cpu = 'arm64';
    } catch { /* ignore */ }
  }
  return platform + '-' + cpu;
}

function buildPlatformKey(platform, arch) {
  if (!platform || !arch) {
    return detectHostPlatformKey();
  }
  // Allow the caller to pass `arch=x64-musl` directly, OR `arch=x64` + `--musl`.
  return `${platform}-${arch}`;
}

function readClaudeCodeVersion() {
  const repoRoot = path.resolve(__dirname, '..');
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const v = pkg.claudeCodeVersion;
  if (!v || typeof v !== 'string') {
    throw new Error(
      'package.json is missing a top-level "claudeCodeVersion" string. ' +
      'Add e.g. "claudeCodeVersion": "2.1.119" to pin the bundled Claude Code release.'
    );
  }
  return v;
}

/**
 * Fetch a URL and stream into a buffer. Follows up to 5 redirects.
 * Honors HTTPS_PROXY / HTTP_PROXY for users behind a corporate proxy.
 */
function httpsGetBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects fetching ${url}`));
          return;
        }
        res.resume();
        resolve(httpsGetBuffer(res.headers.location, redirectsLeft - 1));
        return;
      }
      if (status !== 200) {
        reject(new Error(`HTTP ${status} fetching ${url}`));
        res.resume();
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.setTimeout(60_000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
    req.on('error', reject);
  });
}

async function fetchPackumentDist(pkgName, version) {
  // GET https://registry.npmjs.org/<pkg>/<version> returns version metadata
  // including dist.shasum (sha1) and dist.integrity (sha512 SRI).
  const url = `${REGISTRY}/${encodeURIComponent(pkgName).replace('%40', '@')}/${version}`;
  const buf = await httpsGetBuffer(url);
  const json = JSON.parse(buf.toString('utf-8'));
  if (!json.dist || !json.dist.tarball) {
    throw new Error(`Registry response for ${pkgName}@${version} has no dist.tarball`);
  }
  return json.dist; // { tarball, shasum, integrity, ... }
}

function verifyIntegrity(buffer, dist) {
  // sha1 (shasum) — older verification, still required match
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  if (dist.shasum && sha1 !== dist.shasum) {
    throw new Error(`shasum mismatch: expected ${dist.shasum}, got ${sha1}`);
  }
  // sha512 SRI: "sha512-<base64>"
  if (dist.integrity && dist.integrity.startsWith('sha512-')) {
    const expected = dist.integrity.slice('sha512-'.length);
    const actual = crypto.createHash('sha512').update(buffer).digest('base64');
    if (actual !== expected) {
      throw new Error(`sha512 integrity mismatch: expected ${expected}, got ${actual}`);
    }
  } else if (!dist.shasum) {
    throw new Error(`No shasum or sha512 integrity available for verification`);
  }
}

/**
 * Minimal POSIX tar reader. Only supports ustar regular files (typeflag '0' or
 * '\0'), which is all the npm registry produces. Returns the first entry whose
 * pathname matches `wantedSuffix` (e.g. 'package/claude').
 *
 * We avoid spawning `tar` because Windows hosts may not have it on PATH,
 * and the tarball is tiny (~one binary + 3 metadata files).
 */
function extractFromTarGz(tgzBuffer, wantedSuffix) {
  const inflated = zlib.gunzipSync(tgzBuffer);
  let offset = 0;
  while (offset + 512 <= inflated.length) {
    const header = inflated.slice(offset, offset + 512);
    // End of archive: two consecutive zero blocks
    if (header.every((b) => b === 0)) break;

    const name = header.slice(0, 100).toString('utf-8').replace(/\0.*$/, '');
    const sizeOct = header.slice(124, 136).toString('utf-8').replace(/\0.*$/, '').trim();
    const size = parseInt(sizeOct, 8) || 0;
    const typeflag = String.fromCharCode(header[156]) || '0';
    const prefix = header.slice(345, 500).toString('utf-8').replace(/\0.*$/, '');
    const fullName = prefix ? `${prefix}/${name}` : name;

    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    // round up to next 512 boundary
    const blockEnd = dataStart + Math.ceil(size / 512) * 512;

    const isFile = typeflag === '0' || typeflag === '\u0000';
    if (isFile && (fullName === wantedSuffix || fullName.endsWith('/' + wantedSuffix))) {
      return inflated.slice(dataStart, dataEnd);
    }

    offset = blockEnd;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv);
  const platformKey = buildPlatformKey(args.platform, args.arch);
  const entry = PLATFORMS[platformKey];
  if (!entry) {
    console.error(`[fetch-claude-binary] Unknown platform/arch: ${platformKey}`);
    console.error(`[fetch-claude-binary] Supported: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }

  const version = readClaudeCodeVersion();
  const repoRoot = path.resolve(__dirname, '..');
  const vendorDir = path.join(repoRoot, 'vendor', 'claude-code');
  const destPath = path.join(vendorDir, entry.bin);
  const stampPath = path.join(vendorDir, '.claude-code-version');

  // Skip re-download if the same version + same platform is already present.
  // The stamp file records `${platformKey}@${version}` so a cross-arch packaging
  // run forces a refetch.
  const stampExpected = `${platformKey}@${version}`;
  if (fs.existsSync(destPath) && fs.existsSync(stampPath)) {
    const stamp = fs.readFileSync(stampPath, 'utf-8').trim();
    if (stamp === stampExpected) {
      console.log(`[fetch-claude-binary] Already cached: ${destPath} (${stamp})`);
      return;
    }
  }

  console.log(`[fetch-claude-binary] Target: ${platformKey} @ ${version}`);
  console.log(`[fetch-claude-binary] Package: ${entry.pkg}`);

  fs.mkdirSync(vendorDir, { recursive: true });

  console.log(`[fetch-claude-binary] Querying registry for dist info...`);
  const dist = await fetchPackumentDist(entry.pkg, version);

  console.log(`[fetch-claude-binary] Downloading ${dist.tarball}`);
  const tarball = await httpsGetBuffer(dist.tarball);
  console.log(`[fetch-claude-binary] Got ${tarball.length} bytes, verifying integrity...`);
  verifyIntegrity(tarball, dist);
  console.log(`[fetch-claude-binary] Integrity OK (sha1=${dist.shasum})`);

  // Tarball layout: package/claude  (or package/claude.exe on win32)
  const wanted = `package/${entry.bin}`;
  const binBuf = extractFromTarGz(tarball, wanted);
  if (!binBuf) {
    throw new Error(`Could not find ${wanted} inside ${entry.pkg}@${version} tarball`);
  }

  // Atomic write via .tmp + rename to avoid leaving a half-written binary if
  // the build is interrupted mid-write.
  const tmpPath = destPath + '.tmp';
  fs.writeFileSync(tmpPath, binBuf, { mode: 0o755 });
  fs.renameSync(tmpPath, destPath);

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(destPath, 0o755);
    } catch { /* ignore */ }
  }

  fs.writeFileSync(stampPath, stampExpected, 'utf-8');

  const stat = fs.statSync(destPath);
  console.log(`[fetch-claude-binary] Wrote ${destPath} (${stat.size} bytes)`);

  // Best-effort smoke test, only when targeting the host platform — running
  // a foreign-arch binary obviously won't work.
  // Note: 200MB binaries can take >5s to launch on first invocation
  // (cold cache + dyld warmup), so use a generous timeout.
  const hostKey = detectHostPlatformKey();
  if (hostKey === platformKey && process.platform !== 'win32') {
    try {
      const out = execFileSync(destPath, ['--version'], {
        timeout: 30_000,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
      console.log(`[fetch-claude-binary] Smoke test passed: ${out.trim()}`);
    } catch (err) {
      console.warn(`[fetch-claude-binary] Smoke test failed (non-fatal): ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error('[fetch-claude-binary] Failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
