"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RunLiveCarousel } from "@/components/run-live-carousel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Prediction } from "@/lib/types";

export interface QueuedImage {
  split: string;
  category: string;
  filename: string;
  prediction: Prediction | null; // null = pending
}

interface RunLiveFeedProps {
  runId: string;
  isActive: boolean;
  compact?: boolean;
  modelName?: string;
}

export function RunLiveFeed({ runId, isActive, compact, modelName }: RunLiveFeedProps) {
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load image queue on mount, then poll predictions
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load the image queue (all images that will be processed)
        const imageQueue = await api.getRunImageQueue(runId);
        if (cancelled) return;

        const initial: QueuedImage[] = imageQueue.map((img) => ({
          split: img.split,
          category: img.category,
          filename: img.filename,
          prediction: null,
        }));

        // Load any existing predictions and merge
        const preds = await api.getRunPredictions(runId);
        if (cancelled) return;

        const predMap = new Map(preds.map((p) => [p.image_path, p]));
        for (const item of initial) {
          const key = `${item.split}/${item.category}/${item.filename}`;
          const pred = predMap.get(key);
          if (pred) item.prediction = pred;
        }

        setQueue(initial);
        setLoading(false);
      } catch {
        // Queue might not exist yet for old runs — fall back to predictions only
        try {
          const preds = await api.getRunPredictions(runId);
          if (cancelled) return;
          setQueue(
            preds.map((p) => ({
              split: p.split,
              category: p.category,
              filename: p.filename,
              prediction: p,
            }))
          );
        } catch {
          // ignore
        }
        setLoading(false);
      }
    }

    init();

    // Poll predictions while active
    if (isActive) {
      intervalRef.current = setInterval(async () => {
        try {
          const preds = await api.getRunPredictions(runId);
          setQueue((prev) => {
            if (prev.length === 0) return prev;
            const predMap = new Map(preds.map((p) => [p.image_path, p]));
            let changed = false;
            const next = prev.map((item) => {
              if (item.prediction) return item;
              const key = `${item.split}/${item.category}/${item.filename}`;
              const pred = predMap.get(key);
              if (pred) {
                changed = true;
                return { ...item, prediction: pred };
              }
              return item;
            });
            return changed ? next : prev;
          });
        } catch {
          // ignore polling errors
        }
      }, 2000);
    }

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runId, isActive]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Loading images…
          </div>
        </CardContent>
      </Card>
    );
  }

  if (queue.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Waiting for predictions…
        </CardContent>
      </Card>
    );
  }

  const completed = queue.filter((q) => q.prediction !== null).length;
  const correct = queue.filter((q) => q.prediction?.correct).length;
  const errors = queue.filter((q) => q.prediction?.parsed === "error").length;

  return (
    <Card>
      <CardHeader className={compact ? "pb-2 pt-3 px-4" : "pb-3"}>
        <div className="flex items-center justify-between">
          <CardTitle className={compact ? "text-sm" : "text-base"}>
            {compact && modelName ? modelName : "Live Results"}
          </CardTitle>
          <div className={cn(
            "flex gap-3 text-muted-foreground",
            compact ? "text-xs" : "text-sm"
          )} aria-live="polite">
            <span>
              {completed}/{queue.length}
            </span>
            <span className="text-green-600">{correct} correct</span>
            {errors > 0 && (
              <span className="text-yellow-600">{errors} errors</span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={compact ? "px-3 pb-3 pt-0" : undefined}>
        <RunLiveCarousel
          queue={queue}
          isActive={isActive}
          isCompleted={!isActive && completed === queue.length}
          compact={compact}
          modelName={modelName}
        />
      </CardContent>
    </Card>
  );
}
