"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  CaretDown,
  CaretUp,
  CheckCircle,
  QrCode,
  SpinnerGap,
  Warning,
} from "@/components/ui/icon";
import { useTranslation } from "@/hooks/useTranslation";
import { SettingsCard } from "@/components/patterns/SettingsCard";
import { FieldRow } from "@/components/patterns/FieldRow";
import { StatusBanner } from "@/components/patterns/StatusBanner";

interface FeishuBridgeSettings {
  bridge_feishu_app_id: string;
  bridge_feishu_app_secret: string;
  bridge_feishu_domain: string;
  bridge_feishu_allow_from: string;
  bridge_feishu_dm_policy: string;
  bridge_feishu_thread_session: string;
  bridge_feishu_group_policy: string;
  bridge_feishu_group_allow_from: string;
  bridge_feishu_require_mention: string;
}

const DEFAULT_SETTINGS: FeishuBridgeSettings = {
  bridge_feishu_app_id: "",
  bridge_feishu_app_secret: "",
  bridge_feishu_domain: "feishu",
  bridge_feishu_allow_from: "",
  bridge_feishu_dm_policy: "open",
  bridge_feishu_thread_session: "false",
  bridge_feishu_group_policy: "open",
  bridge_feishu_group_allow_from: "",
  bridge_feishu_require_mention: "false",
};

type QrStatus = "" | "waiting" | "scanned" | "confirmed" | "expired" | "failed";

/** SaveButton: shows Save / Saving / Saved based on dirty + saving state. */
function SaveButton({
  dirty,
  saving,
  onClick,
  label,
  savedLabel,
}: {
  dirty: boolean;
  saving: boolean;
  onClick: () => void;
  label: string;
  savedLabel: string;
}) {
  return (
    <Button size="sm" onClick={onClick} disabled={saving || !dirty}>
      {saving ? (
        <>
          <SpinnerGap size={14} className="animate-spin mr-1.5" />
          {label}
        </>
      ) : dirty ? (
        label
      ) : (
        savedLabel
      )}
    </Button>
  );
}

export function FeishuBridgeSection() {
  // ── Credentials state ──
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [domain, setDomain] = useState("feishu");
  const [credentialsSaving, setCredentialsSaving] = useState(false);
  const [credentialsDirty, setCredentialsDirty] = useState(false);
  const savedCredentials = useRef({ appId: "", appSecret: "", domain: "feishu" });

  // ── Manual entry toggle ──
  const [manualOpen, setManualOpen] = useState(false);

  // ── QR registration state ──
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState<QrStatus>("");
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrDomainSwitched, setQrDomainSwitched] = useState(false);
  const [qrBridgeError, setQrBridgeError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Access & Behavior state ──
  const [allowFrom, setAllowFrom] = useState("");
  const [dmPolicy, setDmPolicy] = useState("open");
  const [threadSession, setThreadSession] = useState(false);
  const [groupPolicy, setGroupPolicy] = useState("open");
  const [groupAllowFrom, setGroupAllowFrom] = useState("");
  const [requireMention, setRequireMention] = useState(false);
  const [behaviorSaving, setBehaviorSaving] = useState(false);
  const [behaviorDirty, setBehaviorDirty] = useState(false);
  const savedBehavior = useRef({
    allowFrom: "", dmPolicy: "open", threadSession: false,
    groupPolicy: "open", groupAllowFrom: "", requireMention: false,
  });

  // ── Verify state ──
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const { t } = useTranslation();

  // ── Dirty tracking ──
  useEffect(() => {
    const s = savedCredentials.current;
    setCredentialsDirty(
      appId !== s.appId || appSecret !== s.appSecret || domain !== s.domain
    );
  }, [appId, appSecret, domain]);

  useEffect(() => {
    const s = savedBehavior.current;
    setBehaviorDirty(
      allowFrom !== s.allowFrom ||
      dmPolicy !== s.dmPolicy ||
      threadSession !== s.threadSession ||
      groupPolicy !== s.groupPolicy ||
      groupAllowFrom !== s.groupAllowFrom ||
      requireMention !== s.requireMention
    );
  }, [allowFrom, dmPolicy, threadSession, groupPolicy, groupAllowFrom, requireMention]);

  // ── Fetch ──
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/feishu");
      if (res.ok) {
        const data = await res.json();
        const s = { ...DEFAULT_SETTINGS, ...data.settings };
        setAppId(s.bridge_feishu_app_id);
        setAppSecret(s.bridge_feishu_app_secret);
        setDomain(s.bridge_feishu_domain || "feishu");
        setAllowFrom(s.bridge_feishu_allow_from);
        setDmPolicy(s.bridge_feishu_dm_policy || "open");
        setThreadSession(s.bridge_feishu_thread_session === "true");
        setGroupPolicy(s.bridge_feishu_group_policy || "open");
        setGroupAllowFrom(s.bridge_feishu_group_allow_from);
        setRequireMention(s.bridge_feishu_require_mention === "true");

        savedCredentials.current = {
          appId: s.bridge_feishu_app_id,
          appSecret: s.bridge_feishu_app_secret,
          domain: s.bridge_feishu_domain || "feishu",
        };
        savedBehavior.current = {
          allowFrom: s.bridge_feishu_allow_from,
          dmPolicy: s.bridge_feishu_dm_policy || "open",
          threadSession: s.bridge_feishu_thread_session === "true",
          groupPolicy: s.bridge_feishu_group_policy || "open",
          groupAllowFrom: s.bridge_feishu_group_allow_from,
          requireMention: s.bridge_feishu_require_mention === "true",
        };
        setCredentialsDirty(false);
        setBehaviorDirty(false);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Cleanup poll timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  // ── Save helpers ──
  const saveToApi = async (updates: Partial<FeishuBridgeSettings>) => {
    const res = await fetch("/api/settings/feishu", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: updates }),
    });
    return res.ok;
  };

  const handleSaveCredentials = async () => {
    setCredentialsSaving(true);
    try {
      const updates: Partial<FeishuBridgeSettings> = {
        bridge_feishu_app_id: appId,
        bridge_feishu_domain: domain,
      };
      if (appSecret && !appSecret.startsWith("***")) {
        updates.bridge_feishu_app_secret = appSecret;
      }
      if (await saveToApi(updates)) {
        savedCredentials.current = { appId, appSecret, domain };
        setCredentialsDirty(false);
      }
    } catch {
      // ignore
    } finally {
      setCredentialsSaving(false);
    }
  };

  const handleSaveBehavior = async () => {
    setBehaviorSaving(true);
    try {
      const ok = await saveToApi({
        bridge_feishu_allow_from: allowFrom,
        bridge_feishu_dm_policy: dmPolicy,
        bridge_feishu_thread_session: threadSession ? "true" : "false",
        bridge_feishu_group_policy: groupPolicy,
        bridge_feishu_group_allow_from: groupAllowFrom,
        bridge_feishu_require_mention: requireMention ? "true" : "false",
      });
      if (ok) {
        savedBehavior.current = {
          allowFrom, dmPolicy, threadSession,
          groupPolicy, groupAllowFrom, requireMention,
        };
        setBehaviorDirty(false);
      }
    } catch {
      // ignore
    } finally {
      setBehaviorSaving(false);
    }
  };

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      if (!appId) {
        setVerifyResult({
          ok: false,
          message: t("feishu.enterCredentialsFirst"),
        });
        return;
      }

      const res = await fetch("/api/settings/feishu/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: appId,
          app_secret: appSecret,
          domain,
        }),
      });
      const data = await res.json();

      if (data.verified) {
        setVerifyResult({
          ok: true,
          message: data.botName
            ? t("feishu.verifiedAs", { name: data.botName })
            : t("feishu.verified"),
        });
      } else {
        setVerifyResult({
          ok: false,
          message: data.error || t("feishu.verifyFailed"),
        });
      }
    } catch {
      setVerifyResult({ ok: false, message: t("feishu.verifyFailed") });
    } finally {
      setVerifying(false);
    }
  };

  // ── QR Registration Flow ──
  const cancelQrSession = useCallback(async (sessionId: string | null) => {
    if (!sessionId) return;
    try {
      await fetch("/api/settings/feishu/register/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch {
      // best-effort cleanup
    }
  }, []);

  const closeQrPanel = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (qrSessionId) {
      void cancelQrSession(qrSessionId);
    }
    setQrImage(null);
    setQrSessionId(null);
    setQrStatus("");
    setQrError(null);
    setQrDomainSwitched(false);
    setQrBridgeError(null);
  }, [cancelQrSession, qrSessionId]);

  const pollQr = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch("/api/settings/feishu/register/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = (await res.json().catch(() => null)) as
          | {
              status?: QrStatus;
              domain?: string;
              domain_switched?: boolean;
              app_id?: string;
              error?: string;
              bridge_restart_error?: string;
            }
          | null;
        if (!res.ok || !data?.status) {
          return;
        }

        setQrStatus(data.status);
        setQrError(data.error || null);
        setQrDomainSwitched(Boolean(data.domain_switched));
        setQrBridgeError(data.bridge_restart_error || null);

        if (data.status === "confirmed") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          // Settings on the server now hold the new credentials.
          // Pull them into the form so the UI reflects reality and
          // immediately verify the bot.
          await fetchSettings();
          // Auto-close after a brief success display, then verify.
          setTimeout(async () => {
            setQrImage(null);
            setQrSessionId(null);
            setQrStatus("");
            setQrError(null);
            setQrDomainSwitched(false);
            setQrBridgeError(null);
            await handleVerify();
          }, 1500);
        } else if (data.status === "failed" || data.status === "expired") {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }
      } catch {
        // network blip — let the next interval retry
      }
    },
    // handleVerify is defined above and stable enough for our purposes;
    // we intentionally exclude it to avoid restarting the timer on every
    // appId/appSecret change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchSettings],
  );

  const startQrRegistration = async () => {
    setQrLoading(true);
    setQrError(null);
    setQrBridgeError(null);
    setQrDomainSwitched(false);
    try {
      const res = await fetch("/api/settings/feishu/register/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ env: "prod" }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            session_id?: string;
            qr_image?: string;
            interval?: number;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.session_id || !data.qr_image) {
        setQrStatus("failed");
        setQrError(data?.error || t("feishu.qrStartFailed"));
        return;
      }

      setQrImage(data.qr_image);
      setQrSessionId(data.session_id);
      setQrStatus("waiting");
      // Start polling — server enforces upstream interval, client polls a
      // bit faster so status changes feel responsive.
      const intervalMs = Math.max(1500, (data.interval ?? 3) * 1000 - 1000);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      const sid = data.session_id;
      pollTimerRef.current = setInterval(() => pollQr(sid), intervalMs);
    } catch (err) {
      setQrStatus("failed");
      setQrError(err instanceof Error ? err.message : t("feishu.qrStartFailed"));
    } finally {
      setQrLoading(false);
    }
  };

  const credentialsLabel = appId
    ? t("feishu.configuredAs", { appId })
    : t("feishu.notConfigured");

  return (
    <div className="max-w-3xl space-y-6">
      {/* ── App Credentials ── */}
      <SettingsCard
        title={t("feishu.credentials")}
        description={t("feishu.credentialsDesc")}
      >
        {/* Current state row */}
        <div className="flex items-center justify-between rounded-md border border-border/30 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            {appId ? (
              <CheckCircle size={16} className="shrink-0 text-emerald-500" />
            ) : (
              <Warning size={16} className="shrink-0 text-muted-foreground" />
            )}
            <p className="text-sm font-mono truncate">{credentialsLabel}</p>
            {appId && (
              <span className="text-xs text-muted-foreground shrink-0">
                {domain === "lark"
                  ? t("feishu.domainLark")
                  : t("feishu.domainFeishu")}
              </span>
            )}
          </div>
        </div>

        {/* Primary action: QR register */}
        {!qrImage ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={startQrRegistration}
              disabled={qrLoading}
            >
              {qrLoading ? (
                <SpinnerGap size={14} className="animate-spin mr-1.5" />
              ) : (
                <QrCode size={14} className="mr-1.5" />
              )}
              {appId ? t("feishu.qrReregister") : t("feishu.qrRegister")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleVerify}
              disabled={verifying || !appId}
            >
              {verifying ? (
                <SpinnerGap
                  size={14}
                  className="animate-spin mr-1.5"
                />
              ) : null}
              {t("feishu.verify")}
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-border/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <QrCode size={16} />
                {t("feishu.qrRegisterTitle")}
              </h3>
              <Button size="sm" variant="ghost" onClick={closeQrPanel}>
                {t("common.cancel")}
              </Button>
            </div>

            <div className="flex justify-center">
              <img
                src={qrImage}
                alt="Feishu QR Code"
                className="w-48 h-48 rounded-md border border-border/30 bg-white p-2"
              />
            </div>

            <p className="text-xs text-center text-muted-foreground">
              {t("feishu.qrRegisterHint")}
            </p>

            <div className="text-center">
              {qrStatus === "waiting" && (
                <StatusBanner variant="info">
                  <SpinnerGap size={14} className="animate-spin mr-1.5 inline" />
                  {t("feishu.qrWaiting")}
                </StatusBanner>
              )}
              {qrStatus === "scanned" && (
                <StatusBanner variant="info">
                  <CheckCircle size={14} className="mr-1.5 inline text-primary" />
                  {t("feishu.qrScanned")}
                </StatusBanner>
              )}
              {qrStatus === "confirmed" && (
                <StatusBanner variant="success">
                  <CheckCircle size={14} className="mr-1.5 inline" />
                  {t("feishu.qrConfirmed")}
                </StatusBanner>
              )}
              {qrStatus === "expired" && (
                <div className="space-y-2">
                  <StatusBanner variant="warning">
                    <Warning size={14} className="mr-1.5 inline" />
                    {t("feishu.qrExpired")}
                  </StatusBanner>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      closeQrPanel();
                      void startQrRegistration();
                    }}
                  >
                    {t("feishu.qrRefresh")}
                  </Button>
                </div>
              )}
              {qrStatus === "failed" && (
                <StatusBanner variant="error">
                  <Warning size={14} className="mr-1.5 inline" />
                  {qrError || t("feishu.qrFailed")}
                </StatusBanner>
              )}
              {qrDomainSwitched && qrStatus !== "confirmed" && (
                <StatusBanner variant="info" className="mt-2">
                  {t("feishu.qrSwitchedToLark")}
                </StatusBanner>
              )}
              {qrBridgeError && (
                <StatusBanner variant="warning" className="mt-2">
                  <Warning size={14} className="mr-1.5 inline" />
                  {`${t("feishu.qrConfirmedRestartFailed")}: ${qrBridgeError}`}
                </StatusBanner>
              )}
            </div>
          </div>
        )}

        {verifyResult && !qrImage && (
          <StatusBanner
            variant={verifyResult.ok ? "success" : "error"}
            icon={verifyResult.ok ? <CheckCircle size={16} className="shrink-0" /> : <Warning size={16} className="shrink-0" />}
          >
            {verifyResult.message}
          </StatusBanner>
        )}

        {/* Manual entry — collapsible advanced section */}
        <div className="border-t pt-3">
          <button
            type="button"
            onClick={() => setManualOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {manualOpen ? <CaretUp size={14} /> : <CaretDown size={14} />}
            {t("feishu.manualEntry")}
          </button>
          {manualOpen && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("feishu.manualEntryDesc")}
              </p>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("feishu.appId")}
                </label>
                <Input
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="cli_xxxxxxxxxx"
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("feishu.appSecret")}
                </label>
                <Input
                  type="password"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t("feishu.domain")}
                </label>
                <Select value={domain} onValueChange={setDomain}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feishu">
                      {t("feishu.domainFeishu")}
                    </SelectItem>
                    <SelectItem value="lark">
                      {t("feishu.domainLark")}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("feishu.domainHint")}
                </p>
              </div>

              <SaveButton
                dirty={credentialsDirty}
                saving={credentialsSaving}
                onClick={handleSaveCredentials}
                label={t("common.save")}
                savedLabel={t("feishu.saved")}
              />
            </div>
          )}
        </div>
      </SettingsCard>

      {/* ── Access & Behavior ── */}
      <SettingsCard
        title={t("feishu.accessBehavior")}
        description={t("feishu.accessBehaviorDesc")}
      >
        <div className="space-y-4">
          {/* DM Policy */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground block">
              {t("feishu.dmPolicy")}
            </label>
            <Select value={dmPolicy} onValueChange={setDmPolicy}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">
                  {t("feishu.dmPolicyOpen")}
                </SelectItem>
                <SelectItem value="pairing">
                  {t("feishu.dmPolicyPairing")}
                </SelectItem>
                <SelectItem value="allowlist">
                  {t("feishu.dmPolicyAllowlist")}
                </SelectItem>
                <SelectItem value="disabled">
                  {t("feishu.dmPolicyDisabled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {t("feishu.allowFrom")}
            </label>
            <Input
              value={allowFrom}
              onChange={(e) => setAllowFrom(e.target.value)}
              placeholder="*, ou_xxxxxxxxxx, ou_yyyyyyyyyy"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("feishu.allowFromHint")}
            </p>
          </div>

          <div className="border-t pt-3 space-y-2">
            <label className="text-xs font-semibold text-foreground block">
              {t("feishu.groupPolicy")}
            </label>
            <Select value={groupPolicy} onValueChange={setGroupPolicy}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">
                  {t("feishu.groupPolicyOpen")}
                </SelectItem>
                <SelectItem value="allowlist">
                  {t("feishu.groupPolicyAllowlist")}
                </SelectItem>
                <SelectItem value="disabled">
                  {t("feishu.groupPolicyDisabled")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {groupPolicy === "allowlist" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t("feishu.groupAllowFrom")}
              </label>
              <Input
                value={groupAllowFrom}
                onChange={(e) => setGroupAllowFrom(e.target.value)}
                placeholder="oc_xxxxxxxxxx, oc_yyyyyyyyyy"
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                {t("feishu.groupAllowFromHint")}
              </p>
            </div>
          )}

          <div className="border-t pt-3">
            <FieldRow
              label={t("feishu.requireMention")}
              description={t("feishu.requireMentionDesc")}
            >
              <Switch
                checked={requireMention}
                onCheckedChange={setRequireMention}
              />
            </FieldRow>
          </div>

          <div className="border-t pt-3">
            <FieldRow
              label={t("feishu.threadSession")}
              description={t("feishu.threadSessionDesc")}
            >
              <Switch
                checked={threadSession}
                onCheckedChange={setThreadSession}
              />
            </FieldRow>
          </div>
        </div>

        <SaveButton
          dirty={behaviorDirty}
          saving={behaviorSaving}
          onClick={handleSaveBehavior}
          label={t("common.save")}
          savedLabel={t("feishu.saved")}
        />
      </SettingsCard>

      {/* ── Setup Guide ── */}
      <SettingsCard title={t("feishu.setupGuide")}>
        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
          <li>{t("feishu.step1")}</li>
          <li>{t("feishu.step2")}</li>
          <li>{t("feishu.step3")}</li>
          <li>{t("feishu.step4")}</li>
          <li>{t("feishu.step5")}</li>
          <li>{t("feishu.step6")}</li>
        </ol>
      </SettingsCard>
    </div>
  );
}
