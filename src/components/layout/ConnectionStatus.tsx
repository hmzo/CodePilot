"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Warning } from "@/components/ui/icon";

import { useTranslation } from "@/hooks/useTranslation";

/**
 * Claude Code is bundled inside the CodePilot install (see
 * scripts/before-pack.js + electron-builder.yml extraResources). User-installed
 * `claude` binaries are surfaced for awareness only — CodePilot never resolves
 * to them.
 */
interface ClaudeInstallInfo {
  path: string;
  version: string | null;
  type: "bundled" | "native" | "homebrew" | "npm" | "bun" | "winget" | "unknown";
}

interface ClaudeStatus {
  connected: boolean;
  version: string | null;
  binaryPath?: string | null;
  installType?: string | null;
  otherInstalls?: ClaudeInstallInfo[];
  missingGit?: boolean;
  warnings?: string[];
}

const BASE_INTERVAL = 60_000; // 60s — bundled binary doesn't change at runtime
const BACKED_OFF_INTERVAL = 180_000; // 3min after 3 stable results
const STABLE_THRESHOLD = 3;

const INSTALL_TYPE_LABELS: Record<string, string> = {
  bundled: "Bundled",
  native: "Native",
  homebrew: "Homebrew",
  npm: "npm",
  bun: "bun",
  winget: "WinGet",
  unknown: "Unknown",
};

export function ConnectionStatus() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ClaudeStatus | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [installingGit, setInstallingGit] = useState(false);
  const [gitInstallResult, setGitInstallResult] = useState<{ success: boolean; error?: string } | null>(null);

  const isElectron =
    typeof window !== "undefined" && !!window.electronAPI?.install;
  const stableCountRef = useRef(0);
  const lastConnectedRef = useRef<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const interval = stableCountRef.current >= STABLE_THRESHOLD
      ? BACKED_OFF_INTERVAL
      : BASE_INTERVAL;
    timerRef.current = setTimeout(() => checkRef.current(), interval);
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/claude-status");
      if (res.ok) {
        const data: ClaudeStatus = await res.json();
        if (lastConnectedRef.current === data.connected) {
          stableCountRef.current++;
        } else {
          stableCountRef.current = 0;
        }
        lastConnectedRef.current = data.connected;
        setStatus(data);
      }
    } catch {
      if (lastConnectedRef.current === false) {
        stableCountRef.current++;
      } else {
        stableCountRef.current = 0;
      }
      lastConnectedRef.current = false;
      setStatus({ connected: false, version: null });
    }
    schedule();
  }, [schedule]);

  useEffect(() => {
    checkRef.current = checkStatus;
  }, [checkStatus]);

  useEffect(() => {
    checkStatus();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkStatus]);

  const handleManualRefresh = useCallback(() => {
    stableCountRef.current = 0;
    checkStatus();
  }, [checkStatus]);

  const handleInstallGit = useCallback(async () => {
    if (!window.electronAPI?.install?.installGit) return;
    setInstallingGit(true);
    setGitInstallResult(null);
    try {
      const result = await window.electronAPI.install.installGit();
      setGitInstallResult(result);
      if (result.success) {
        try { await fetch('/api/claude-status/invalidate', { method: 'POST' }); } catch { /* best-effort */ }
        stableCountRef.current = 0;
        checkStatus();
      }
    } catch (err) {
      setGitInstallResult({ success: false, error: String(err) });
    } finally {
      setInstallingGit(false);
    }
  }, [checkStatus]);

  const connected = status?.connected ?? false;
  const hasOtherInstalls = (status?.otherInstalls?.length ?? 0) > 0;
  const missingGit = status?.missingGit ?? false;
  // Bundled is always the active install once connected. Other user-level
  // installs are informational, not warnings.
  const hasBlockingIssue = !connected || missingGit;
  const installTypeLabel = status?.installType
    ? INSTALL_TYPE_LABELS[status.installType] ?? status.installType
    : null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setDialogOpen(true)}
        className={cn(
          "h-7 rounded-full px-2.5 text-[11px] font-medium gap-1.5",
          status === null
            ? "bg-muted text-muted-foreground"
            : connected
              ? missingGit
                ? "bg-status-error-muted text-status-error-foreground"
                : "bg-status-success-muted text-status-success-foreground"
              : "bg-status-error-muted text-status-error-foreground"
        )}
      >
        <span
          className={cn(
            "block h-1.5 w-1.5 shrink-0 rounded-full",
            status === null
              ? "bg-muted-foreground/40"
              : connected
                ? missingGit
                  ? "bg-status-error"
                  : "bg-status-success"
                : "bg-status-error"
          )}
        />
        {status === null
          ? t('connection.checking')
          : connected
            ? missingGit
              ? t('connection.missingGit')
              : t('connection.bundled')
            : t('connection.unavailable')}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {hasBlockingIssue
                ? missingGit
                  ? t('connection.missingGitTitle')
                  : t('connection.unavailableTitle')
                : t('connection.bundledTitle')}
            </DialogTitle>
            <DialogDescription>
              {hasBlockingIssue
                ? missingGit
                  ? t('connection.missingGitDesc')
                  : t('connection.unavailableDesc')
                : t('connection.bundledDesc', { version: status?.version ?? '' })}
            </DialogDescription>
          </DialogHeader>

          {connected ? (
            <div className="space-y-3 text-sm">
              {/* Bundled status card */}
              <div className="flex items-center gap-3 rounded-lg bg-status-success-muted px-4 py-3">
                <span className="block h-2.5 w-2.5 shrink-0 rounded-full bg-status-success" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-status-success-foreground">
                    {t('connection.bundledActive')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('connection.version', { version: status?.version ?? '' })}
                    {installTypeLabel && ` (${installTypeLabel})`}
                  </p>
                  {status?.binaryPath && (
                    <p className="text-xs text-muted-foreground font-mono break-all">
                      {status.binaryPath}
                    </p>
                  )}
                </div>
              </div>

              {/* Informational note: other user-level installs detected */}
              {hasOtherInstalls && (
                <div className="rounded-lg bg-muted px-4 py-3 space-y-2">
                  <p className="text-xs font-medium">
                    {t('connection.otherInstallsTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('connection.otherInstallsHint')}
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {status?.otherInstalls?.map((inst, i) => (
                      <div key={i} className="space-y-0.5">
                        <p className="font-mono break-all">
                          <code className="bg-background px-1 rounded">{inst.path}</code>
                          {" "}({INSTALL_TYPE_LABELS[inst.type] ?? inst.type}
                          {inst.version ? ` v${inst.version}` : ''})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Git Bash missing — still a real blocker on Windows */}
              {missingGit && (
                <div className="rounded-lg bg-status-error-muted px-4 py-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Warning size={16} className="text-status-error-foreground shrink-0" />
                    <p className="font-medium text-status-error-foreground text-xs">
                      {t('connection.missingGitTitle')}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('connection.missingGitDesc')}
                  </p>
                  {gitInstallResult ? (
                    <div className={cn(
                      "rounded-md px-3 py-2 text-xs",
                      gitInstallResult.success ? "bg-status-success-muted text-status-success-foreground" : "bg-muted text-muted-foreground"
                    )}>
                      <p className="font-medium">
                        {gitInstallResult.success ? t('connection.gitInstallSuccess') : t('connection.gitInstallFailed')}
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {isElectron && (
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={handleInstallGit}
                          disabled={installingGit}
                        >
                          {installingGit ? t('connection.gitInstalling') : t('connection.installGit')}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className={isElectron ? "" : "flex-1"}
                        onClick={() => window.open('https://git-scm.com/downloads/win', '_blank')}
                      >
                        {t('connection.downloadGit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleManualRefresh}
                      >
                        {t('connection.recheck')}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-lg bg-status-error-muted px-4 py-3">
                <span className="block h-2.5 w-2.5 shrink-0 rounded-full bg-status-error" />
                <p className="font-medium text-status-error-foreground">
                  {t('connection.unavailableTitle')}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {t('connection.unavailableDesc')}
              </p>
              {status?.binaryPath && (
                <p className="text-xs text-muted-foreground font-mono break-all">
                  {status.binaryPath}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleManualRefresh}
            >
              {t('connection.refresh')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
