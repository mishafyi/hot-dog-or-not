"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Trophy, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContainer,
  DialogContent,
  DialogClose,
  DialogImage,
} from "@/components/uilayouts/linear-modal";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtLatency } from "@/lib/format";
import { ModelLogo } from "@/components/model-logo";
import type {
  Metrics,
  LatencyStats,
} from "@/lib/types";

interface ModelSummary {
  run_id: string;
  model_id: string;
  model_name: string;
  metrics: Metrics;
  ci_lower: number;
  ci_upper: number;
  latency: LatencyStats;
}

interface DisagreementPrediction {
  parsed: string;
  correct: boolean;
  latency_ms: number;
  model_name: string;
  raw_response: string;
  reasoning: string;
}

interface Disagreement {
  image_path: string;
  split: string;
  category: string;
  filename: string;
  predictions: Record<string, DisagreementPrediction>;
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 py-6">
          <div>
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-5 w-40 mt-2" />
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      }
    >
      <ResultsDashboard />
    </Suspense>
  );
}

function ResultsDashboard() {
  const searchParams = useSearchParams();
  const runIdsParam = searchParams.get("run_ids");

  const [summaries, setSummaries] = useState<ModelSummary[]>([]);
  const [disagreements, setDisagreements] = useState<Disagreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runIdsParam) {
      api
        .getLeaderboard()
        .then((entries) => {
          if (entries.length === 0) {
            setError("No completed runs found");
            setLoading(false);
            return;
          }
          const runIds = entries.map((e) => e.run_id);
          return loadData(runIds);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    } else {
      const ids = runIdsParam.split(",").filter(Boolean);
      loadData(ids);
    }
  }, [runIdsParam]);

  async function loadData(runIds: string[]) {
    try {
      const [summaryData, compareData] = await Promise.all([
        api.getBatchSummary(runIds),
        api.getComparison(runIds),
      ]);
      setSummaries(summaryData);
      setDisagreements(compareData.disagreements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load results");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 py-6">
        <div>
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-5 w-40 mt-2" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || summaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <Trophy className="size-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-1">No results yet</h2>
        <p className="text-muted-foreground text-sm max-w-sm mb-4">
          {error || "Run a benchmark to see how different models perform on hot dog classification."}
        </p>
        <Link
          href="/run"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Run Benchmark
        </Link>
      </div>
    );
  }

  const sorted = [...summaries].sort(
    (a, b) => b.metrics.accuracy - a.metrics.accuracy
  );
  const maxAccuracy = Math.max(...sorted.map((s) => s.ci_upper), 1);

  const BAR_OPACITIES = [
    "bg-emerald-500/70",
    "bg-emerald-500/55",
    "bg-emerald-500/40",
    "bg-emerald-500/30",
    "bg-emerald-500/20",
    "bg-emerald-500/15",
  ];

  const winner = sorted[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Results Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {summaries.length} models &middot; {summaries[0]?.metrics.total ?? 0} images
        </p>
      </div>

      {/* Model Comparison */}
      <div className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-background p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl transition-all group-hover:bg-emerald-500/10" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-500 border-0 text-xs font-bold uppercase px-2.5 py-0.5">
              95% CI
            </Badge>
            <span className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
              Model Comparison
            </span>
          </div>
          <div className="space-y-5">
            {sorted.map((s, i) => {
              const accPct = s.metrics.accuracy * 100;
              const ciLow = s.ci_lower * 100;
              const ciHigh = s.ci_upper * 100;
              const scale = maxAccuracy * 100;
              const bar = BAR_OPACITIES[i % BAR_OPACITIES.length];
              return (
                <div key={s.model_id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {i === 0 && <Trophy className="size-5 text-amber-400 shrink-0" />}
                      <ModelLogo modelId={s.model_id} size={56} />
                      <Link
                        href={`/results/${encodeURIComponent(s.model_id)}`}
                        className="text-base font-bold hover:underline transition-colors truncate text-foreground"
                      >
                        {s.model_name}
                      </Link>
                      {s.metrics.errors > 0 && (
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-full bg-rose-500/10 text-rose-500 shrink-0">
                          {s.metrics.errors} err
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-4 shrink-0">
                      <span className="font-mono text-sm tabular-nums text-muted-foreground">
                        F1 {(s.metrics.f1 * 100).toFixed(1)}
                      </span>
                      <span className="font-mono text-3xl font-extrabold tabular-nums text-emerald-500">
                        {accPct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative h-7 rounded-lg bg-muted/50 overflow-hidden flex-1">
                      <div
                        className="absolute inset-y-0 rounded-lg bg-emerald-500/10"
                        style={{
                          left: `${(ciLow / scale) * 100}%`,
                          width: `${((ciHigh - ciLow) / scale) * 100}%`,
                        }}
                      />
                      <div
                        className={cn("absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out", bar)}
                        style={{ width: `${(accPct / scale) * 100}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-muted-foreground/30"
                        style={{ left: `${(ciLow / scale) * 100}%` }}
                      />
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-muted-foreground/30"
                        style={{ left: `${(ciHigh / scale) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0 w-24 text-right">
                      CI {ciLow.toFixed(1)}&ndash;{ciHigh.toFixed(1)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 2: Latency */}
      <div className="group relative overflow-hidden rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background p-6 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl transition-all group-hover:bg-blue-500/10" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-5">
            <Badge variant="secondary" className="bg-blue-500/10 text-blue-500 border-0 text-xs font-bold">
              ms
            </Badge>
            <span className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
              Latency
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-blue-500/10 hover:bg-transparent">
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wider">Model</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wider text-right">Mean</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wider text-right">Median</TableHead>
                <TableHead className="text-muted-foreground text-xs uppercase tracking-wider text-right">p95</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="font-mono">
              {sorted.map((s) => (
                <TableRow key={s.model_id} className="border-blue-500/10">
                  <TableCell className="text-foreground font-semibold text-sm">
                    <span className="inline-flex items-center gap-2">
                      <ModelLogo modelId={s.model_id} size={48} />
                      {s.model_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {fmtLatency(s.latency.mean_ms)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-bold text-xl text-foreground">
                    {fmtLatency(s.latency.median_ms)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground font-medium">
                    {fmtLatency(s.latency.p95_ms)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Row 3: Disagreements */}
      <div className="group relative overflow-hidden rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-background p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-rose-500/5 blur-3xl transition-all group-hover:bg-rose-500/10" />
        <div className="flex items-center gap-3 mb-5 relative z-10">
          <Badge variant="secondary" className="bg-rose-500/10 text-rose-500 border-0 text-sm font-bold px-2.5 py-0.5">
            {disagreements.length}
          </Badge>
          <span className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">
            Disagreements
          </span>
        </div>
        <div className="relative z-10">
          {disagreements.length === 0 ? (
            <p className="text-lg text-muted-foreground font-medium">
              All models agree on every image.
            </p>
          ) : (
            <ScrollArea className="max-h-[400px]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pr-3">
              {disagreements.slice(0, 20).map((d) => (
                <Dialog
                  key={d.image_path}
                  transition={{ type: "spring", stiffness: 200, damping: 24 }}
                >
                  <DialogTrigger className="w-full text-left">
                    <div className="flex items-start gap-3 rounded-xl border border-border/50 bg-background/50 p-3.5 hover:border-border transition-colors group/card">
                      <DialogImage
                        src={api.imageUrl(d.split, d.category, d.filename)}
                        alt={`${d.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${d.filename}`}
                        className="size-12 rounded-lg object-cover shrink-0 ring-1 ring-border"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider font-semibold">
                          {d.category === "hot_dog" ? "Hot Dog" : "Not Hot Dog"}
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {Object.entries(d.predictions).map(([, pred]) => (
                            <span
                              key={pred.model_name}
                              className={cn(
                                "inline-flex items-center gap-1.5 text-sm font-mono font-medium",
                                pred.correct ? "text-emerald-500" : "text-rose-500"
                              )}
                            >
                              <span className={cn(
                                "size-1.5 rounded-full shrink-0",
                                pred.correct ? "bg-emerald-500" : "bg-rose-500"
                              )} />
                              {pred.model_name}: {pred.parsed}
                            </span>
                          ))}
                        </div>
                      </div>
                      <span className="size-6 shrink-0 rounded-full border border-border/50 bg-muted/50 flex items-center justify-center text-muted-foreground group-hover/card:border-border group-hover/card:text-foreground transition-colors text-xs font-bold">
                        +
                      </span>
                    </div>
                  </DialogTrigger>
                  <DialogContainer>
                    <DialogContent className="relative w-[90vw] max-w-[640px] rounded-2xl border border-border bg-background shadow-2xl mx-auto my-[5vh]">
                      <div className="p-6">
                          <DialogImage
                            src={api.imageUrl(d.split, d.category, d.filename)}
                            alt={`${d.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${d.filename}`}
                            className="w-full h-64 rounded-xl object-cover"
                          />
                          <div className="mt-4 flex items-center justify-between">
                            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                              Ground truth:{" "}
                              <span className="text-foreground">
                                {d.category === "hot_dog" ? "Hot Dog" : "Not Hot Dog"}
                              </span>
                            </div>
                          </div>
                          <div className="mt-4 space-y-3">
                            {Object.entries(d.predictions).map(([, pred]) => (
                              <div
                                key={pred.model_name}
                                className={cn(
                                  "rounded-xl border p-4",
                                  pred.correct
                                    ? "border-emerald-500/30 bg-emerald-500/5"
                                    : "border-rose-500/30 bg-rose-500/5"
                                )}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-semibold text-sm text-foreground">
                                    {pred.model_name}
                                  </span>
                                  <div className="flex items-center gap-2 text-xs font-mono">
                                    <span className={cn("inline-flex items-center gap-1", pred.correct ? "text-emerald-500" : "text-rose-500")}>
                                      {pred.correct ? <Check className="size-3" /> : <X className="size-3" />} {pred.parsed}
                                    </span>
                                    <span className="text-muted-foreground">
                                      {pred.latency_ms < 1000
                                        ? `${pred.latency_ms.toFixed(0)}ms`
                                        : `${(pred.latency_ms / 1000).toFixed(1)}s`}
                                    </span>
                                  </div>
                                </div>
                                {(pred.reasoning || pred.raw_response) && (
                                  <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                                    {pred.reasoning || pred.raw_response}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                      </div>
                      <DialogClose className="absolute right-4 top-4 rounded-full bg-background/80 backdrop-blur p-1.5 text-muted-foreground hover:text-foreground transition-colors border border-border/50" aria-label="Close dialog" />
                    </DialogContent>
                  </DialogContainer>
                </Dialog>
              ))}
            </div>
            </ScrollArea>
          )}
          {disagreements.length > 20 && (
            <p className="text-xs text-muted-foreground text-center mt-3 font-medium">
              + {disagreements.length - 20} more
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
