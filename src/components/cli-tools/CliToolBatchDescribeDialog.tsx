"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SpinnerGap, CheckCircle, XCircle, Sparkle } from "@/components/ui/icon";
import { useTranslation } from "@/hooks/useTranslation";
import { BUILT_IN_MODELS, DEFAULT_MODEL_ID } from "@/lib/anthropic-models";

type AutoDescCache = Record<string, { zh: string; en: string; structured?: unknown }>;

interface CliToolBatchDescribeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolIds: string[];
  existingDescriptions: AutoDescCache;
  onComplete: (results: AutoDescCache) => void;
}

type Phase = "select" | "running" | "done";

interface ToolResult {
  id: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  error?: string;
}

export function CliToolBatchDescribeDialog({
  open,
  onOpenChange,
  toolIds,
  existingDescriptions,
  onComplete,
}: CliToolBatchDescribeDialogProps) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>("select");
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);
  const [toolResults, setToolResults] = useState<ToolResult[]>([]);
  const [skipExisting, setSkipExisting] = useState(true);
  const resultsRef = useRef<AutoDescCache>({});
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("select");
    abortControllerRef.current = null;
    resultsRef.current = {};
    setToolResults([]);
  }, [open]);

  const handleStart = useCallback(async () => {
    const idsToProcess = skipExisting
      ? toolIds.filter(id => !existingDescriptions[id])
      : [...toolIds];

    if (idsToProcess.length === 0) {
      setPhase("done");
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setPhase("running");
    setToolResults(idsToProcess.map(id => ({ id, status: 'pending' })));

    for (let i = 0; i < idsToProcess.length; i++) {
      if (controller.signal.aborted) break;

      const toolId = idsToProcess[i];
      setToolResults(prev => prev.map((r, idx) =>
        idx === i ? { ...r, status: 'loading' } : r
      ));

      try {
        const body: Record<string, string> = {};
        if (selectedModel) {
          body.model = selectedModel;
        }

        const res = await fetch(`/api/cli-tools/${toolId}/describe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        resultsRef.current[toolId] = data.description;

        setToolResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'success' } : r
        ));
      } catch (err) {
        if (controller.signal.aborted) break;
        setToolResults(prev => prev.map((r, idx) =>
          idx === i ? { ...r, status: 'error', error: err instanceof Error ? err.message : 'Failed' } : r
        ));
      }
    }

    if (!controller.signal.aborted && Object.keys(resultsRef.current).length > 0) {
      onComplete(resultsRef.current);
    }
    if (!controller.signal.aborted) {
      setPhase("done");
    }
  }, [toolIds, existingDescriptions, skipExisting, selectedModel, onComplete]);

  const handleClose = () => {
    // Abort any in-flight requests
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    onOpenChange(false);
  };

  const successCount = toolResults.filter(r => r.status === 'success').length;
  const errorCount = toolResults.filter(r => r.status === 'error').length;

  const toolsToProcessCount = skipExisting
    ? toolIds.filter(id => !existingDescriptions[id]).length
    : toolIds.length;
  const existingCount = toolIds.filter(id => !!existingDescriptions[id]).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkle size={18} />
            {t('cliTools.batchDescribe')}
          </DialogTitle>
          <DialogDescription>
            {t('cliTools.batchDescribeIntro')}
          </DialogDescription>
        </DialogHeader>

        {phase === "select" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t('cliTools.batchModel')}
              </label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUILT_IN_MODELS.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Skip existing toggle */}
            {existingCount > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                {/* eslint-disable-next-line no-restricted-syntax -- no Checkbox UI component available */}
                <input
                  type="checkbox"
                  checked={skipExisting}
                  onChange={e => setSkipExisting(e.target.checked)}
                  className="rounded border-input"
                />
                {t('cliTools.batchSkipExisting', { count: String(existingCount) })}
              </label>
            )}

            {/* Summary */}
            <p className="text-xs text-muted-foreground">
              {t('cliTools.batchToolCount', { count: String(toolsToProcessCount), total: String(toolIds.length) })}
            </p>
          </div>
        )}

        {phase === "running" && (
          <div className="flex flex-col gap-2 py-2 max-h-64 overflow-y-auto">
            {toolResults.map(r => (
              <div key={r.id} className="flex items-center gap-2 text-sm">
                {r.status === 'pending' && (
                  <span className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
                )}
                {r.status === 'loading' && (
                  <SpinnerGap size={16} className="animate-spin text-status-info-foreground shrink-0" />
                )}
                {r.status === 'success' && (
                  <CheckCircle size={16} weight="fill" className="text-status-success-foreground shrink-0" />
                )}
                {r.status === 'error' && (
                  <XCircle size={16} weight="fill" className="text-destructive shrink-0" />
                )}
                <span className="truncate">{r.id}</span>
                {r.status === 'error' && r.error && (
                  <span className="text-xs text-destructive truncate ml-auto">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {phase === "done" && (
          <div className="flex flex-col gap-2 py-2">
            <div className="flex items-center gap-4 text-sm">
              {successCount > 0 && (
                <span className="flex items-center gap-1 text-status-success-foreground">
                  <CheckCircle size={16} weight="fill" />
                  {t('cliTools.batchSuccess', { count: String(successCount) })}
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle size={16} weight="fill" />
                  {t('cliTools.batchFailed', { count: String(errorCount) })}
                </span>
              )}
              {successCount === 0 && errorCount === 0 && (
                <span className="text-muted-foreground">{t('cliTools.batchNothingToProcess')}</span>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {phase === "select" && (
            <>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                {t('cliTools.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleStart}
                disabled={!selectedModel || toolsToProcessCount === 0}
                className="gap-1.5"
              >
                <Sparkle size={14} />
                {t('cliTools.batchStart')}
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              {t('cliTools.cancel')}
            </Button>
          )}
          {phase === "done" && (
            <Button size="sm" onClick={handleClose}>
              {t('cliTools.done')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
