"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useModelDetail, useModelPredictions } from "@/hooks/use-results";
import { ModelCard } from "@/components/model-card";
import { ConfusionMatrix } from "@/components/confusion-matrix";
import { ImageGrid } from "@/components/image-grid";
import { DiscreteTabs } from "@/components/discrete-tabs";
import { Flame, Ban } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fmtLatency } from "@/lib/format";
import { ModelLogo } from "@/components/model-logo";

export default function ModelDetailPage() {
  const params = useParams();
  const modelId = decodeURIComponent(params.modelId as string);
  const { data: detail, loading, error } = useModelDetail(modelId);
  const [activeTab, setActiveTab] = useState("all");
  const filter = activeTab === "all" ? undefined : activeTab;
  const { data: predictions, loading: predsLoading } = useModelPredictions(
    modelId,
    filter
  );

  if (loading) {
    return (
      <div className="space-y-6 py-6">
        <div>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-64 mt-2" />
          <Skeleton className="h-5 w-40 mt-1" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="py-8 text-center">
        <p className="text-destructive text-lg">
          {error || "No results found for this model"}
        </p>
        <Link href="/results" className="text-primary underline mt-2 inline-block">
          Back to results
        </Link>
      </div>
    );
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const ciText =
    detail.ci_lower !== undefined && detail.ci_upper !== undefined
      ? `${(detail.ci_lower * 100).toFixed(1)}–${(detail.ci_upper * 100).toFixed(1)}%`
      : "";
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/results"
          className="text-sm text-muted-foreground hover:text-foreground font-medium"
        >
          &larr; Back to results
        </Link>
        <h1 className="text-3xl font-bold mt-2 flex items-center gap-3">
          <ModelLogo modelId={modelId} size={28} />
          {detail.model_name}
        </h1>
        <p className="text-muted-foreground mt-1">
          {detail.provider} &middot; {detail.params} parameters
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ModelCard
          title="Accuracy"
          value={pct(detail.metrics.accuracy)}
          subtitle={ciText ? `95% CI: ${ciText}` : undefined}
          color="emerald"
        />
        <ModelCard title="Precision" value={pct(detail.metrics.precision)} />
        <ModelCard title="Recall" value={pct(detail.metrics.recall)} />
        <ModelCard title="F1 Score" value={pct(detail.metrics.f1)} />
      </div>

      {/* Latency stats */}
      {detail.latency && (
        <div className="grid grid-cols-3 gap-4">
          <ModelCard
            title="Mean Latency"
            value={fmtLatency(detail.latency.mean_ms)}
            color="neutral"
          />
          <ModelCard
            title="Median Latency"
            value={fmtLatency(detail.latency.median_ms)}
            color="neutral"
          />
          <ModelCard
            title="p95 Latency"
            value={fmtLatency(detail.latency.p95_ms)}
            color="neutral"
          />
        </div>
      )}

      {/* Per-category breakdown */}
      {detail.category_breakdown && detail.category_breakdown.length > 0 && (
        <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wider mb-4 text-muted-foreground">
            Per-Category Breakdown
          </p>
          <div className="space-y-4">
            {detail.category_breakdown.map((cat) => {
              const accPct = cat.accuracy * 100;
              const ciLow = cat.ci_lower * 100;
              const ciHigh = cat.ci_upper * 100;
              const isHotDog = cat.category === "hot_dog";
              return (
                <div key={cat.category} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-base capitalize text-foreground">
                      {isHotDog ? <Flame className="size-5 text-orange-500 inline mr-1" /> : <Ban className="size-5 text-blue-500 inline mr-1" />}
                      {cat.category.replace("_", " ")}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className={cn(
                        "font-mono text-2xl font-extrabold tabular-nums",
                        isHotDog ? "text-orange-500" : "text-blue-500"
                      )}>
                        {accPct.toFixed(1)}%
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        ({ciLow.toFixed(1)}&ndash;{ciHigh.toFixed(1)}) &middot; {cat.correct}/{cat.total}
                      </span>
                    </div>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="absolute inset-y-0 bg-muted-foreground/10 rounded-full"
                      style={{
                        left: `${ciLow}%`,
                        width: `${ciHigh - ciLow}%`,
                      }}
                    />
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
                        isHotDog ? "bg-orange-500" : "bg-blue-500"
                      )}
                      style={{ width: `${accPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <ConfusionMatrix metrics={detail.metrics} />
        <div className="grid grid-cols-2 gap-4">
          <ModelCard
            title="Total Predictions"
            value={String(detail.metrics.total)}
          />
          <ModelCard
            title="Errors"
            value={String(detail.metrics.errors)}
            subtitle="Unparseable responses"
            color={detail.metrics.errors > 0 ? "pink" : "neutral"}
          />
          <ModelCard
            title="True Positives"
            value={String(detail.metrics.true_positives)}
            color="emerald"
          />
          <ModelCard
            title="True Negatives"
            value={String(detail.metrics.true_negatives)}
            color="blue"
          />
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold mb-4">Predictions</h2>
        <DiscreteTabs
          value={activeTab}
          onValueChange={setActiveTab}
          counts={{
            all: detail.metrics.total,
            correct: detail.metrics.true_positives + detail.metrics.true_negatives,
            incorrect: detail.metrics.false_positives + detail.metrics.false_negatives,
            error: detail.metrics.errors,
          }}
        />
        <div className="mt-4">
          {predsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" />
              ))}
            </div>
          ) : (
            <ImageGrid predictions={predictions} />
          )}
        </div>
      </div>
    </div>
  );
}
