import { NextResponse } from 'next/server';
import {
  findClaudeBinary,
  getClaudeVersion,
  findAllClaudeBinaries,
  classifyClaudePath,
  isWindows,
  findGitBash,
} from '@/lib/platform';
import type { ClaudeInstallInfo, ClaudeInstallType } from '@/lib/platform';

/** Minimum CLI versions for optional features */
const FEATURE_MIN_VERSIONS: Record<string, string> = {
  thinking: '1.0.10',
  context1m: '1.0.20',
  effort: '1.0.15',
};

/** Extract pure semver from strings like "2.1.90 (Claude Code)" → "2.1.90" */
function extractVersion(v: string): string {
  const match = v.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : v;
}

/** Compare two semver-like version strings. Returns true if a >= b */
function versionGte(a: string, b: string): boolean {
  const pa = extractVersion(a).split('.').map(Number);
  const pb = extractVersion(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return true;
    if (va < vb) return false;
  }
  return true;
}

/**
 * Status route — Claude Code is bundled with CodePilot, so the install
 * resolution path is fixed and the only thing this endpoint actually probes
 * at runtime is the bundled binary's `--version` output (cheap sanity check).
 *
 * `otherInstalls` is still surfaced so the UI can show users which user-level
 * `claude` binaries are floating around — purely informational, never used
 * for resolution.
 */
export async function GET() {
  try {
    const claudePath = findClaudeBinary();

    // On Windows, Git Bash is required by the Claude Code runtime for shell
    // tool calls. The bundled binary still depends on a host-installed bash.
    const missingGit = isWindows && findGitBash() === null;

    if (!claudePath) {
      // Should be unreachable in production: the bundled binary is shipped
      // inside the .app/installer. Treat as a hard error if the file is
      // missing (e.g. user manually deleted Resources/claude/).
      const warnings: string[] = ['Bundled Claude Code binary is missing from the install — please reinstall CodePilot.'];
      if (missingGit) warnings.push('Git Bash not found — some features may not work');
      return NextResponse.json({
        connected: false,
        version: null,
        binaryPath: null,
        installType: null,
        otherInstalls: [],
        missingGit,
        warnings,
        features: {},
      });
    }

    const version = await getClaudeVersion(claudePath);
    const installType: ClaudeInstallType = classifyClaudePath(claudePath);

    // User-installed `claude` binaries are listed read-only so the user
    // knows they exist; we never resolve to them.
    let otherInstalls: ClaudeInstallInfo[] = [];
    try {
      const all = findAllClaudeBinaries();
      otherInstalls = all.filter(i => i.path !== claudePath);
    } catch {
      // non-critical
    }

    // Feature detection still depends on the bundled binary's version since
    // some UI affordances are gated by what the binary supports.
    const features: Record<string, boolean> = {};
    if (version) {
      for (const [feature, minVersion] of Object.entries(FEATURE_MIN_VERSIONS)) {
        features[feature] = versionGte(version, minVersion);
      }
    }

    const warnings: string[] = [];
    if (missingGit) {
      warnings.push('Git Bash not found — some features may not work');
    }
    if (otherInstalls.length > 0) {
      warnings.push(`${otherInstalls.length} user-installed Claude CLI detected (informational — CodePilot uses its bundled copy)`);
    }

    return NextResponse.json({
      connected: !!version,
      version,
      binaryPath: claudePath,
      installType,
      otherInstalls,
      missingGit,
      warnings,
      features,
    });
  } catch {
    return NextResponse.json({
      connected: false,
      version: null,
      binaryPath: null,
      installType: null,
      otherInstalls: [],
      missingGit: false,
      warnings: [],
      features: {},
    });
  }
}
