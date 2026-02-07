"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UnifiedCarousel } from "@/components/unified-carousel";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Prediction, ImageSlot, ModelPredictionSlot } from "@/lib/types";

interface UnifiedBenchmarkFeedProps {
  batchRunIds: Record<string, string>; // modelId → runId
  modelNames: Map<string, string>; // modelId → display name
  isActive: boolean;
}

export function UnifiedBenchmarkFeed({ batchRunIds, modelNames, isActive }: UnifiedBenchmarkFeedProps) {
  const [slots, setSlots] = useState<ImageSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const modelEntries = Object.entries(batchRunIds);
  const modelCount = modelEntries.length;

  // Load image queue once from any run, then poll predictions for all runs
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Load image queue from the first run (all runs share the same images)
        const firstRunId = Object.values(batchRunIds)[0];
        const imageQueue = await api.getRunImageQueue(firstRunId);
        if (cancelled) return;

        const initial: ImageSlot[] = imageQueue.map((img) => ({
          split: img.split,
          category: img.category,
          filename: img.filename,
          imageKey: `${img.split}/${img.category}/${img.filename}`,
          models: modelEntries.map(([modelId]) => ({
            modelId,
            modelName: modelNames.get(modelId) || modelId,
            prediction: null,
          })),
          allModelsComplete: false,
        }));

        // Load any existing predictions across all runs
        const allPreds = await Promise.all(
          modelEntries.map(async ([modelId, runId]) => {
            const preds = await api.getRunPredictions(runId);
            return { modelId, preds };
          })
        );
        if (cancelled) return;

        // Merge existing predictions
        for (const { modelId, preds } of allPreds) {
          const predMap = new Map(preds.map((p) => [p.image_path, p]));
          for (const slot of initial) {
            const pred = predMap.get(slot.imageKey);
            if (pred) {
              const modelSlot = slot.models.find((m) => m.modelId === modelId);
              if (modelSlot) modelSlot.prediction = pred;
            }
          }
        }

        // Update allModelsComplete
        for (const slot of initial) {
          slot.allModelsComplete = slot.models.every((m) => m.prediction !== null);
        }

        setSlots(initial);
        setLoading(false);
      } catch {
        // Fallback: try loading predictions directly
        try {
          const allPreds = await Promise.all(
            modelEntries.map(async ([modelId, runId]) => {
              const preds = await api.getRunPredictions(runId);
              return { modelId, preds };
            })
          );
          if (cancelled) return;

          // Build slots from predictions
          const imageMap = new Map<string, ImageSlot>();
          for (const { modelId, preds } of allPreds) {
            for (const p of preds) {
              const key = `${p.split}/${p.category}/${p.filename}`;
              if (!imageMap.has(key)) {
                imageMap.set(key, {
                  split: p.split,
                  category: p.category,
                  filename: p.filename,
                  imageKey: key,
                  models: modelEntries.map(([mid]) => ({
                    modelId: mid,
                    modelName: modelNames.get(mid) || mid,
                    prediction: null,
                  })),
                  allModelsComplete: false,
                });
              }
              const slot = imageMap.get(key)!;
              const modelSlot = slot.models.find((m) => m.modelId === modelId);
              if (modelSlot) modelSlot.prediction = p;
            }
          }

          const slots = Array.from(imageMap.values());
          for (const slot of slots) {
            slot.allModelsComplete = slot.models.every((m) => m.prediction !== null);
          }
          setSlots(slots);
        } catch {
          // ignore
        }
        setLoading(false);
      }
    }

    init();

    // Poll predictions for all runs while active
    if (isActive) {
      intervalRef.current = setInterval(async () => {
        try {
          const allPreds = await Promise.all(
            modelEntries.map(async ([modelId, runId]) => {
              const preds = await api.getRunPredictions(runId);
              return { modelId, preds };
            })
          );

          setSlots((prev) => {
            if (prev.length === 0) return prev;

            // Build lookup: modelId → (imagePath → Prediction)
            const predLookup = new Map<string, Map<string, Prediction>>();
            for (const { modelId, preds } of allPreds) {
              predLookup.set(modelId, new Map(preds.map((p) => [p.image_path, p])));
            }

            let changed = false;
            const next = prev.map((slot) => {
              const newModels = slot.models.map((m) => {
                if (m.prediction) return m;
                const predMap = predLookup.get(m.modelId);
                const pred = predMap?.get(slot.imageKey);
                if (pred) {
                  changed = true;
                  return { ...m, prediction: pred };
                }
                return m;
              });

              if (newModels === slot.models) return slot;

              const allComplete = newModels.every((m) => m.prediction !== null);
              if (newModels.some((m, i) => m !== slot.models[i]) || allComplete !== slot.allModelsComplete) {
                changed = true;
                return { ...slot, models: newModels, allModelsComplete: allComplete };
              }
              return slot;
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
  }, [batchRunIds, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          <div className="flex items-center justify-center gap-2">
            <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            Loading images...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (slots.length === 0) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">
          Waiting for predictions...
        </CardContent>
      </Card>
    );
  }

  const completedImages = slots.filter((s) => s.allModelsComplete).length;
  const totalPredictions = slots.reduce(
    (s, slot) => s + slot.models.filter((m) => m.prediction !== null).length,
    0
  );
  const correctPredictions = slots.reduce(
    (s, slot) => s + slot.models.filter((m) => m.prediction?.correct).length,
    0
  );

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">Live Results</CardTitle>
          <div className="flex gap-2.5 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            <span>{completedImages}/{slots.length} images</span>
            <span className="text-muted-foreground/30">|</span>
            <span>{modelCount} models</span>
            <span className="text-muted-foreground/30">|</span>
            <span className="text-green-500">{correctPredictions}/{totalPredictions} correct</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <UnifiedCarousel
          slots={slots}
          isActive={isActive}
          isCompleted={!isActive && completedImages === slots.length}
          modelCount={modelCount}
        />
      </CardContent>
    </Card>
  );
}
