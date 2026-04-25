'use client';

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { MediaJob, MediaJobItem, PlannerOutput } from '@/types';

// ==========================================
// Types
// ==========================================

// Note: 'entry' and 'planning' phases were removed when the provider system
// was deleted — Claude generates the plan inline as a ```batch-plan``` JSON
// fence which is rendered by `BatchPlanInlinePreview`. The hook only handles
// reviewing → executing → completed → syncing once a plan has been injected.
export type BatchPhase = 'idle' | 'reviewing' | 'executing' | 'completed' | 'syncing';

export interface BatchImageGenState {
  enabled: boolean;
  phase: BatchPhase;
  currentJob: MediaJob | null;
  items: MediaJobItem[];
  plannerOutput: PlannerOutput | null;
  progress: {
    total: number;
    completed: number;
    failed: number;
    processing: number;
  };
  error: string | null;
}

export interface BatchImageGenContextValue {
  state: BatchImageGenState;
  setEnabled: (v: boolean) => void;
  executeJob: (sessionId?: string) => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: () => Promise<void>;
  cancelJob: () => Promise<void>;
  retryFailed: () => Promise<void>;
  syncToLlm: (syncMode?: 'manual' | 'auto_batch') => Promise<void>;
  resetJob: () => void;
  injectPlanAndExecute: (plan: PlannerOutput, sessionId?: string) => Promise<void>;
}

// ==========================================
// Context
// ==========================================

export const BatchImageGenContext = createContext<BatchImageGenContextValue | null>(null);

export function useBatchImageGen(): BatchImageGenContextValue {
  const ctx = useContext(BatchImageGenContext);
  if (!ctx) {
    throw new Error('useBatchImageGen must be used within a BatchImageGenProvider');
  }
  return ctx;
}

// ==========================================
// State Hook
// ==========================================

const initialState: BatchImageGenState = {
  enabled: false,
  phase: 'idle',
  currentJob: null,
  items: [],
  plannerOutput: null,
  progress: { total: 0, completed: 0, failed: 0, processing: 0 },
  error: null,
};

export function useBatchImageGenState(): BatchImageGenContextValue {
  const [state, setState] = useState<BatchImageGenState>(initialState);
  const progressSourceRef = useRef<EventSource | null>(null);

  const setEnabled = useCallback((v: boolean) => {
    setState(prev => ({
      ...prev,
      enabled: v,
      phase: 'idle',
      error: null,
    }));
  }, []);

  const executeJob = useCallback(async (sessionId?: string) => {
    const currentPlan = state.plannerOutput;
    if (!currentPlan || currentPlan.items.length === 0) return;

    setState(prev => ({ ...prev, phase: 'executing', error: null }));

    try {
      // Create the job
      const createRes = await fetch('/api/media/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          items: currentPlan.items.map(item => ({
            prompt: item.prompt,
            aspectRatio: item.aspectRatio,
            imageSize: item.resolution,
            tags: item.tags,
            sourceRefs: item.sourceRefs,
          })),
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({ error: 'Failed to create job' }));
        throw new Error(err.error);
      }

      const { job, items } = await createRes.json();
      setState(prev => ({
        ...prev,
        currentJob: job,
        items,
        progress: { total: items.length, completed: 0, failed: 0, processing: 0 },
      }));

      // Start execution
      const startRes = await fetch(`/api/media/jobs/${job.id}/start`, { method: 'POST' });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({ error: 'Failed to start job' }));
        throw new Error(err.error);
      }

      // Connect to progress SSE
      connectProgressSSE(job.id);
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: 'reviewing',
        error: err instanceof Error ? err.message : 'Execution failed',
      }));
    }
  }, [state.plannerOutput]);

  const connectProgressSSE = useCallback((jobId: string) => {
    // Close existing connection
    if (progressSourceRef.current) {
      progressSourceRef.current.close();
    }

    const es = new EventSource(`/api/media/jobs/${jobId}/progress`);
    progressSourceRef.current = es;

    const handleEvent = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);

        if (data.progress) {
          setState(prev => ({ ...prev, progress: data.progress }));
        }

        if (data.items) {
          setState(prev => ({ ...prev, items: data.items }));
        }
      } catch { /* ignore parse errors */ }
    };

    es.addEventListener('snapshot', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        setState(prev => ({
          ...prev,
          progress: data.progress,
          items: data.items || prev.items,
        }));
      } catch { /* ignore */ }
    });

    es.addEventListener('item_started', handleEvent);
    es.addEventListener('item_completed', (e: MessageEvent) => {
      handleEvent(e);
      // Refresh items from server for latest state
      refreshItems(jobId);
    });
    es.addEventListener('item_failed', handleEvent);
    es.addEventListener('item_retry', handleEvent);

    es.addEventListener('job_completed', (e: MessageEvent) => {
      handleEvent(e);
      setState(prev => ({ ...prev, phase: 'completed' }));
      es.close();
      progressSourceRef.current = null;
      refreshItems(jobId);
    });

    es.addEventListener('job_paused', (e: MessageEvent) => {
      handleEvent(e);
      refreshItems(jobId);
    });

    es.addEventListener('job_cancelled', (e: MessageEvent) => {
      handleEvent(e);
      setState(prev => ({ ...prev, phase: 'completed' }));
      es.close();
      progressSourceRef.current = null;
      refreshItems(jobId);
    });

    es.addEventListener('done', () => {
      es.close();
      progressSourceRef.current = null;
    });

    es.onerror = () => {
      es.close();
      progressSourceRef.current = null;
    };
  }, []);

  const refreshItems = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/media/jobs/${jobId}`);
      if (res.ok) {
        const data = await res.json();
        setState(prev => ({
          ...prev,
          currentJob: data.job,
          items: data.items,
        }));
      }
    } catch { /* ignore */ }
  }, []);

  const pauseJob = useCallback(async () => {
    if (!state.currentJob) return;
    try {
      await fetch(`/api/media/jobs/${state.currentJob.id}/pause`, { method: 'POST' });
      setState(prev => ({
        ...prev,
        currentJob: prev.currentJob ? { ...prev.currentJob, status: 'paused' } : null,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to pause',
      }));
    }
  }, [state.currentJob]);

  const resumeJob = useCallback(async () => {
    if (!state.currentJob) return;
    try {
      await fetch(`/api/media/jobs/${state.currentJob.id}/resume`, { method: 'POST' });
      setState(prev => ({
        ...prev,
        currentJob: prev.currentJob ? { ...prev.currentJob, status: 'running' } : null,
      }));
      connectProgressSSE(state.currentJob.id);
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to resume',
      }));
    }
  }, [state.currentJob, connectProgressSSE]);

  const cancelJob = useCallback(async () => {
    if (!state.currentJob) return;
    try {
      await fetch(`/api/media/jobs/${state.currentJob.id}/cancel`, { method: 'POST' });
      if (progressSourceRef.current) {
        progressSourceRef.current.close();
        progressSourceRef.current = null;
      }
      setState(prev => ({
        ...prev,
        phase: 'completed',
        currentJob: prev.currentJob ? { ...prev.currentJob, status: 'cancelled' } : null,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to cancel',
      }));
    }
  }, [state.currentJob]);

  const retryFailed = useCallback(async () => {
    if (!state.currentJob) return;
    // Resume the job — the executor will pick up failed items that haven't exhausted retries
    try {
      await fetch(`/api/media/jobs/${state.currentJob.id}/resume`, { method: 'POST' });
      setState(prev => ({
        ...prev,
        phase: 'executing',
        currentJob: prev.currentJob ? { ...prev.currentJob, status: 'running' } : null,
      }));
      connectProgressSSE(state.currentJob.id);
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to retry',
      }));
    }
  }, [state.currentJob, connectProgressSSE]);

  const syncToLlm = useCallback(async (syncMode: 'manual' | 'auto_batch' = 'manual') => {
    if (!state.currentJob) return;

    setState(prev => ({ ...prev, phase: 'syncing', error: null }));

    try {
      const res = await fetch(`/api/media/jobs/${state.currentJob.id}/sync-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncMode }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(err.error);
      }

      setState(prev => ({
        ...prev,
        phase: 'idle',
        enabled: false,
      }));
    } catch (err) {
      setState(prev => ({
        ...prev,
        phase: 'completed',
        error: err instanceof Error ? err.message : 'Sync failed',
      }));
    }
  }, [state.currentJob]);

  const resetJob = useCallback(() => {
    if (progressSourceRef.current) {
      progressSourceRef.current.close();
      progressSourceRef.current = null;
    }
    setState(initialState);
  }, []);

  const injectPlanAndExecute = useCallback(async (plan: PlannerOutput, _sessionId?: string) => {
    // Inject plan into state so the UI shows the reviewing phase
    setState(prev => ({
      ...prev,
      enabled: true,
      phase: 'reviewing',
      plannerOutput: plan,
      error: null,
    }));
  }, []);

  return {
    state,
    setEnabled,
    executeJob,
    pauseJob,
    resumeJob,
    cancelJob,
    retryFailed,
    syncToLlm,
    resetJob,
    injectPlanAndExecute,
  };
}
