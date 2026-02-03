"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { RunControls } from "@/components/run-controls";
import { RunLiveFeed } from "@/components/run-live-feed";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { RunMeta, ModelInfo } from "@/lib/types";

const BATCHES_PER_PAGE = 8;

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface BatchGroup {
  id: string; // batch_id or run_id for ungrouped
  runs: RunMeta[];
  isBatch: boolean;
  startedAt: string | null;
  completedAt: string | null;
  totalModels: number;
  avgAccuracy: number | null;
  sampleSize: number | null;
  allCompleted: boolean;
  anyFailed: boolean;
}

function groupIntoBatches(runs: RunMeta[]): BatchGroup[] {
  const batchMap = new Map<string, RunMeta[]>();
  const ungrouped: RunMeta[] = [];

  for (const run of runs) {
    if (run.batch_id) {
      const existing = batchMap.get(run.batch_id) || [];
      existing.push(run);
      batchMap.set(run.batch_id, existing);
    } else {
      ungrouped.push(run);
    }
  }

  const groups: BatchGroup[] = [];

  for (const [batchId, batchRuns] of batchMap) {
    const totalCorrect = batchRuns.reduce((s, r) => s + r.correct, 0);
    const totalProcessed = batchRuns.reduce((s, r) => s + r.processed, 0);
    const avgAccuracy = totalProcessed > 0 ? (totalCorrect / totalProcessed) * 100 : null;
    const allCompleted = batchRuns.every((r) => r.status === "completed");
    const anyFailed = batchRuns.some((r) => r.status === "failed");

    groups.push({
      id: batchId,
      runs: batchRuns,
      isBatch: true,
      startedAt: batchRuns[0]?.started_at ?? null,
      completedAt: batchRuns.find((r) => r.completed_at)?.completed_at ?? null,
      totalModels: batchRuns.length,
      avgAccuracy,
      sampleSize: batchRuns[0]?.sample_size ?? null,
      allCompleted,
      anyFailed,
    });
  }

  // Each ungrouped run becomes its own "batch" of 1
  for (const run of ungrouped) {
    const accuracy = run.processed > 0 ? (run.correct / run.processed) * 100 : null;
    groups.push({
      id: run.run_id,
      runs: [run],
      isBatch: false,
      startedAt: run.started_at,
      completedAt: run.completed_at,
      totalModels: 1,
      avgAccuracy: accuracy,
      sampleSize: run.sample_size,
      allCompleted: run.status === "completed",
      anyFailed: run.status === "failed",
    });
  }

  // Sort by started_at descending
  groups.sort((a, b) => {
    if (!a.startedAt || !b.startedAt) return 0;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });

  return groups;
}

const ACTIVE_BATCH_KEY = "hotdog_active_batch";

function saveActiveBatch(batchId: string, runIds: Record<string, string>) {
  try {
    localStorage.setItem(ACTIVE_BATCH_KEY, JSON.stringify({ batchId, runIds }));
  } catch {}
}

function loadActiveBatch(): { batchId: string; runIds: Record<string, string> } | null {
  try {
    const raw = localStorage.getItem(ACTIVE_BATCH_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearActiveBatch() {
  try {
    localStorage.removeItem(ACTIVE_BATCH_KEY);
  } catch {}
}

export default function RunPage() {
  const [batchRunIds, setBatchRunIds] = useState<Record<string, string> | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchComplete, setBatchComplete] = useState(false);
  const [pastRuns, setPastRuns] = useState<RunMeta[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [page, setPage] = useState(0);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore active batch from localStorage on mount
  useEffect(() => {
    const saved = loadActiveBatch();
    if (saved) {
      // Check if any runs are still active
      Promise.all(
        Object.values(saved.runIds).map((id) => api.getRunStatus(id))
      ).then((statuses) => {
        const anyActive = statuses.some(
          (s) => s.status === "running" || s.status === "pending"
        );
        if (anyActive) {
          setBatchRunIds(saved.runIds);
          setBatchId(saved.batchId);
          setBatchComplete(false);
        } else {
          clearActiveBatch();
        }
      }).catch(() => clearActiveBatch());
    }
  }, []);

  useEffect(() => {
    api.getModels().then(setModels).catch(console.error);
    api
      .listRuns()
      .then((runs) => {
        setPastRuns(runs.filter((r) => r.status !== "running" && r.status !== "pending"));
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!batchRunIds) return;
    const runIds = Object.values(batchRunIds);

    pollRef.current = setInterval(async () => {
      try {
        const statuses = await Promise.all(
          runIds.map((id) => api.getRunStatus(id))
        );
        const allDone = statuses.every(
          (s) => s.status === "completed" || s.status === "failed" || s.status === "cancelled"
        );
        if (allDone) {
          setBatchComplete(true);
          clearActiveBatch();
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batchRunIds]);

  const handleBatchStarted = (runIds: Record<string, string>, id: string) => {
    setBatchRunIds(runIds);
    setBatchId(id);
    setBatchComplete(false);
    saveActiveBatch(id, runIds);
  };

  const handleStop = async () => {
    if (!batchId) return;
    try {
      await api.cancelBatch(batchId);
      setBatchComplete(true);
      clearActiveBatch();
      toast.success("Benchmark stopped");
    } catch {
      toast.error("Failed to stop benchmark");
    }
  };

  const modelNameMap = new Map(models.map((m) => [m.id, m.name]));

  const batches = useMemo(() => groupIntoBatches(pastRuns), [pastRuns]);

  // Filter: only show batches (with batch_id), hide old ungrouped runs
  const savedBatches = batches.filter((b) => b.isBatch);
  const totalPages = Math.ceil(savedBatches.length / BATCHES_PER_PAGE);
  const pagedBatches = savedBatches.slice(
    page * BATCHES_PER_PAGE,
    (page + 1) * BATCHES_PER_PAGE
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">Run Benchmark</h1>
        <p className="text-muted-foreground mt-1">
          Test LLM vision models on hot dog classification and compare accuracy
        </p>
      </div>

      <RunControls onBatchStarted={handleBatchStarted} batchRunning={!!batchRunIds && !batchComplete} />

      {/* 2x2 grid of compact carousels */}
      {batchRunIds && (
        <div className="space-y-4">
          {!batchComplete && (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleStop}
              >
                Stop Benchmark
              </Button>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Object.entries(batchRunIds).map(([modelId, runId]) => (
              <RunLiveFeed
                key={runId}
                runId={runId}
                isActive={!batchComplete}
                compact
                modelName={modelNameMap.get(modelId) || modelId}
              />
            ))}
          </div>
          {batchComplete && (
            <div className="flex justify-center">
              <Link
                href={`/results?run_ids=${Object.values(batchRunIds).join(",")}`}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                View Results Dashboard &rarr;
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Past Runs — grouped by batch */}
      {savedBatches.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Past Runs
            </h2>
            <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 font-mono">
              {savedBatches.length}
            </Badge>
            <div className="ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  try {
                    const { removed } = await api.clearHistory();
                    setPastRuns([]);
                    setPage(0);
                    toast.success(`Cleared ${removed} run${removed !== 1 ? "s" : ""}`);
                  } catch {
                    toast.error("Failed to clear history");
                  }
                }}
              >
                Clear History
              </Button>
            </div>
          </div>
          <div className="rounded-xl border overflow-hidden">
            {pagedBatches.map((batch, i) => {
              const accuracyStr = batch.avgAccuracy !== null
                ? batch.avgAccuracy.toFixed(1)
                : null;
              const expanded = expandedBatch === batch.id;

              return (
                <div key={batch.id} className={cn(i > 0 && "border-t")}>
                  {/* Batch summary row */}
                  <button
                    type="button"
                    className="flex items-center gap-4 px-5 py-3.5 bg-card transition-colors hover:bg-muted/20 cursor-pointer w-full text-left"
                    onClick={() => setExpandedBatch(expanded ? null : batch.id)}
                  >
                    {/* Expand chevron */}
                    <svg
                      className={cn(
                        "size-3.5 text-muted-foreground/50 shrink-0 transition-transform",
                        expanded && "rotate-90"
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>

                    {/* Batch info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {batch.totalModels} model{batch.totalModels !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground/50">&middot;</span>
                        <span className="text-xs text-muted-foreground">
                          {batch.sampleSize ?? "all"} images
                        </span>
                      </div>
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {batch.runs.map((r) => (
                          <span
                            key={r.run_id}
                            className="text-[10px] text-muted-foreground/70"
                          >
                            {r.model_name}
                            {r !== batch.runs[batch.runs.length - 1] && ","}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Avg accuracy pill */}
                    {accuracyStr && (
                      <span className={cn(
                        "text-xs font-mono font-semibold tabular-nums px-2.5 py-1 rounded-full",
                        batch.avgAccuracy !== null && batch.avgAccuracy >= 80
                          ? "bg-green-500/15 text-green-400"
                          : batch.avgAccuracy !== null && batch.avgAccuracy >= 50
                            ? "bg-yellow-500/15 text-yellow-400"
                            : "bg-red-500/15 text-red-400"
                      )}>
                        {accuracyStr}%
                      </span>
                    )}

                    {/* Time */}
                    {batch.completedAt && (
                      <span className="text-xs text-muted-foreground/60 w-16 text-right hidden sm:block">
                        {formatRelativeTime(batch.completedAt)}
                      </span>
                    )}

                    {/* Status */}
                    <Badge
                      variant={batch.anyFailed ? "destructive" : "outline"}
                      className={cn(
                        "text-[10px] capitalize",
                        batch.allCompleted && "border-green-500/30 text-green-400"
                      )}
                    >
                      {batch.anyFailed ? "failed" : batch.allCompleted ? "completed" : "partial"}
                    </Badge>

                    {/* View Results button */}
                    <Link
                      href={`/results?run_ids=${batch.runs.map((r) => r.run_id).join(",")}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium px-3 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors hidden sm:block"
                    >
                      Results
                    </Link>
                  </button>

                  {/* Expanded: individual model runs */}
                  {expanded && (
                    <div className="border-t bg-muted/5" aria-live="polite">
                      {batch.runs.map((run, j) => {
                        const runAccuracy = run.processed > 0
                          ? ((run.correct / run.processed) * 100)
                          : null;
                        const runAccuracyStr = runAccuracy !== null ? runAccuracy.toFixed(1) : null;

                        return (
                          <div
                            key={run.run_id}
                            className={cn(
                              "flex items-center gap-4 pl-12 pr-5 py-2.5 transition-colors hover:bg-muted/20",
                              j > 0 && "border-t border-dashed"
                            )}
                          >
                            {/* Mini accuracy bar */}
                            <div className="w-1 h-6 rounded-full overflow-hidden bg-muted shrink-0">
                              <div
                                className={cn(
                                  "w-full rounded-full",
                                  run.status === "completed"
                                    ? runAccuracy !== null && runAccuracy >= 80
                                      ? "bg-green-500"
                                      : runAccuracy !== null && runAccuracy >= 50
                                        ? "bg-yellow-500"
                                        : "bg-red-500"
                                    : run.status === "failed"
                                      ? "bg-red-500"
                                      : "bg-muted-foreground/40"
                                )}
                                style={{
                                  height: `${run.status === "completed" && run.total_images > 0
                                    ? (run.processed / run.total_images) * 100
                                    : 0}%`
                                }}
                              />
                            </div>

                            <span className="text-sm flex-1 truncate">{run.model_name}</span>

                            <span className="text-xs text-muted-foreground font-mono tabular-nums">
                              {run.processed}/{run.total_images}
                            </span>

                            {runAccuracyStr && (
                              <span className={cn(
                                "text-[10px] font-mono font-semibold tabular-nums px-2 py-0.5 rounded-full",
                                runAccuracy !== null && runAccuracy >= 80
                                  ? "bg-green-500/15 text-green-400"
                                  : runAccuracy !== null && runAccuracy >= 50
                                    ? "bg-yellow-500/15 text-yellow-400"
                                    : "bg-red-500/15 text-red-400"
                              )}>
                                {runAccuracyStr}%
                              </span>
                            )}

                            <Badge
                              variant={run.status === "failed" ? "destructive" : "outline"}
                              className={cn(
                                "text-[10px] capitalize",
                                run.status === "completed" && "border-green-500/30 text-green-400"
                              )}
                            >
                              {run.status}
                            </Badge>
                          </div>
                        );
                      })}

                      {/* View Results link for mobile */}
                      <div className="px-12 py-2.5 border-t border-dashed sm:hidden">
                        <Link
                          href={`/results?run_ids=${batch.runs.map((r) => r.run_id).join(",")}`}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          View Results &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground/60 tabular-nums">
                {page * BATCHES_PER_PAGE + 1}&ndash;{Math.min((page + 1) * BATCHES_PER_PAGE, savedBatches.length)} of {savedBatches.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-xs h-7 px-2.5"
                >
                  Prev
                </Button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <Button
                    key={i}
                    variant={i === page ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPage(i)}
                    className="text-xs h-7 w-7 p-0 font-mono"
                  >
                    {i + 1}
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page === totalPages - 1}
                  className="text-xs h-7 px-2.5"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
