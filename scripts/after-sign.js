/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * electron-builder afterSign hook — code signing for macOS.
 *
 * When a real Developer ID certificate is available (CSC_LINK or CSC_NAME env
 * vars are set), electron-builder handles signing automatically. This hook only
 * runs a strict verification to confirm the signature is intact.
 *
 * When no certificate is available (local dev builds), falls back to ad-hoc
 * signing so that electron-updater's ShipIt process can still validate the
 * code signature.
 *
 * Ad-hoc signing order (inside-out):
 *   0. Bundled Claude Code binary (Resources/claude/claude)
 *   1. All native binaries (.node, .dylib, .so)
 *   2. All Frameworks (*.framework)
 *   3. All Helper apps (*.app inside Frameworks/)
 *   4. The main .app bundle
 *
 * In Developer ID mode, we also re-sign Resources/claude/claude with our
 * identity so its outer signature matches the .app bundle (Anthropic ships
 * the binary pre-signed with their own Developer ID).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Ad-hoc sign a single path. Failures are logged but non-fatal to avoid
 * breaking builds on edge-case binaries (e.g. debug symbols).
 */
function codesign(targetPath) {
  try {
    execSync(`codesign --force --sign - "${targetPath}"`, {
      stdio: 'pipe',
      timeout: 30000,
    });
  } catch (err) {
    console.warn(`[afterSign] Failed to sign ${targetPath}: ${err.message}`);
  }
}

/**
 * Recursively collect all files matching the given extensions.
 */
function collectFiles(dir, extensions) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Don't descend into .app or .framework bundles — they are signed as a unit
      if (entry.name.endsWith('.app') || entry.name.endsWith('.framework')) {
        continue;
      }
      results.push(...collectFiles(fullPath, extensions));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

/**
 * Collect bundle directories (.app, .framework) at a given depth.
 */
function collectBundles(dir, extension) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith(extension)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

module.exports = async function afterSign(context) {
  const platform = context.packager.platform.name;
  if (platform !== 'mac') return;

  const appOutDir = context.appOutDir;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    console.warn(`[afterSign] macOS app not found at ${appPath}, skipping`);
    return;
  }

  const contentsPath = path.join(appPath, 'Contents');
  const frameworksPath = path.join(contentsPath, 'Frameworks');

  // ── Detect real (non-ad-hoc) code signature ───────────────────────────
  // Check env vars first (CI path), then probe the actual signature on the
  // .app bundle (covers the case where electron-builder auto-discovered a
  // Developer ID certificate from the local Keychain).
  let hasRealSignature = !!(process.env.CSC_LINK || process.env.CSC_NAME);

  if (!hasRealSignature) {
    try {
      const info = execSync(`codesign -d --verbose=2 "${appPath}" 2>&1`, {
        stdio: 'pipe',
        timeout: 15000,
        encoding: 'utf-8',
      });
      if (/Authority=Developer ID Application/.test(info)) {
        hasRealSignature = true;
      }
    } catch {
      // codesign -d fails if the bundle is unsigned — that's fine
    }
  }

  // The bundled Claude Code binary lives at Contents/Resources/claude/claude
  // and ships pre-signed by Anthropic with their Developer ID. We always need
  // to re-sign it with whatever identity is signing the rest of the bundle so
  // that `codesign --verify --deep --strict` doesn't trip on the mismatched
  // outer/inner signing identity.
  const bundledClaudePath = path.join(contentsPath, 'Resources', 'claude', 'claude');

  if (hasRealSignature) {
    console.log('[afterSign] Real code signing certificate detected (CSC_LINK/CSC_NAME set or Developer ID signature found).');

    if (fs.existsSync(bundledClaudePath)) {
      const identity = process.env.CSC_NAME || 'Developer ID Application';
      const entitlementsPath = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');
      try {
        execSync(
          `codesign --force --options runtime --timestamp ` +
            `--entitlements "${entitlementsPath}" ` +
            `--sign "${identity}" "${bundledClaudePath}"`,
          { stdio: 'pipe', timeout: 60000 }
        );
        console.log('[afterSign] Re-signed bundled Claude Code binary with Developer ID.');
      } catch (err) {
        console.error(
          '[afterSign] WARNING: Failed to re-sign bundled Claude Code binary:',
          err.stderr?.toString() || err.message
        );
      }
    }

    try {
      execSync(`codesign --verify --deep --strict --verbose=4 "${appPath}"`, {
        stdio: 'pipe',
        timeout: 60000,
      });
      console.log('[afterSign] Developer ID signature verification passed.');
    } catch (err) {
      console.error('[afterSign] WARNING: Developer ID signature verification FAILED:', err.stderr?.toString() || err.message);
    }
    return;
  }

  // ── No certificate — ad-hoc signing fallback ─────────────────────────
  console.log(`[afterSign] Ad-hoc signing ${appPath} (individual component signing)...`);

  let signed = 0;

  // Step 0: Sign the bundled Claude Code binary (~210 MB, pre-signed by
  // Anthropic). Has to come first so the outer .app signature stays consistent.
  if (fs.existsSync(bundledClaudePath)) {
    codesign(bundledClaudePath);
    signed++;
    console.log('[afterSign]   Signed bundled Claude Code binary');
  }

  // Step 1: Sign all native binaries (.node, .dylib, .so)
  const nativeBinaries = collectFiles(contentsPath, ['.node', '.dylib', '.so']);
  for (const bin of nativeBinaries) {
    codesign(bin);
    signed++;
  }
  if (nativeBinaries.length > 0) {
    console.log(`[afterSign]   Signed ${nativeBinaries.length} native binaries (.node/.dylib/.so)`);
  }

  // Step 2: Sign all Frameworks
  const frameworks = collectBundles(frameworksPath, '.framework');
  for (const fw of frameworks) {
    codesign(fw);
    signed++;
  }
  if (frameworks.length > 0) {
    console.log(`[afterSign]   Signed ${frameworks.length} frameworks`);
  }

  // Step 3: Sign all Helper apps
  const helperApps = collectBundles(frameworksPath, '.app');
  for (const helper of helperApps) {
    codesign(helper);
    signed++;
  }
  if (helperApps.length > 0) {
    console.log(`[afterSign]   Signed ${helperApps.length} helper apps`);
  }

  // Step 4: Sign the main app bundle
  codesign(appPath);
  signed++;

  console.log(`[afterSign] Ad-hoc signing complete — ${signed} components signed`);

  // Verify
  try {
    execSync(`codesign --verify --deep --strict "${appPath}"`, {
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log('[afterSign] Signature verification passed (--deep --strict)');
  } catch (err) {
    console.error('[afterSign] WARNING: Signature verification FAILED:', err.stderr?.toString() || err.message);
  }
};
