"use client";

import { useState, useEffect } from "react";
import { DualRangeSlider } from "@/components/uilayouts/slider";
import { StatusButton } from "@/components/status-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ModelLogo } from "@/components/model-logo";
import type { ModelInfo, DatasetStatus } from "@/lib/types";

interface RunControlsProps {
  onBatchStarted: (runIds: Record<string, string>, batchId: string) => void;
  batchRunning?: boolean;
}

export function RunControls({ onBatchStarted, batchRunning = false }: RunControlsProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(new Set());
  const [dataset, setDataset] = useState<DatasetStatus | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(5);
  const [apiKey, setApiKey] = useState<string>("");
  const [btnStatus, setBtnStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getModels().then((m) => {
      setModels(m);
      setSelectedModelIds(new Set(m.map((model) => model.id)));
    }).catch(console.error);
    api.getDatasetStatus().then(setDataset).catch(console.error);
  }, []);

  const maxImages = dataset
    ? Math.min(dataset.hot_dog_count, dataset.not_hot_dog_count)
    : 23;

  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // Keep at least 1
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStart = async () => {
    setBtnStatus("loading");
    setError(null);
    try {
      const size = sampleSize > 0 && sampleSize < maxImages ? sampleSize : undefined;
      const modelIds = selectedModelIds.size < models.length
        ? Array.from(selectedModelIds)
        : undefined;
      const result = await api.startBatchRun(size, apiKey || undefined, modelIds);
      setBtnStatus("success");
      toast.success("Benchmark started");
      onBatchStarted(result.run_ids, result.batch_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start batch run";
      setError(msg);
      toast.error(msg);
      setBtnStatus("idle");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Dataset status */}
        {dataset && !dataset.downloaded && (
          <div className="px-6 py-4 border-b">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
              Dataset not found. Add images to{" "}
              <code className="bg-destructive/10 px-1.5 py-0.5 rounded font-mono text-xs">
                backend/data/test/hot_dog/
              </code>{" "}
              and{" "}
              <code className="bg-destructive/10 px-1.5 py-0.5 rounded font-mono text-xs">
                backend/data/test/not_hot_dog/
              </code>
            </div>
          </div>
        )}

        {/* Models section — toggleable */}
        <div className="px-6 py-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="models-section">Models</Label>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">Free vision models from OpenRouter — tap to toggle</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {selectedModelIds.size}/{models.length} selected
            </span>
          </div>
          <div className="flex flex-wrap gap-3">
            {models.map((m) => {
              const selected = selectedModelIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleModel(m.id)}
                  className={cn(
                    "inline-flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-medium transition-colors cursor-pointer border",
                    selected
                      ? "bg-green-500/15 border-green-500/40 text-green-400"
                      : "bg-muted/50 border-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  <ModelLogo modelId={m.id} size={36} />
                  <div className="flex flex-col items-start leading-tight">
                    <span className={cn(
                      "text-xs font-medium",
                      selected ? "text-green-400/70" : "text-muted-foreground/70"
                    )}>
                      {m.provider}
                    </span>
                    <span className="font-semibold text-sm">
                      {m.name.replace(m.provider + " ", "").replace(" " + m.params, "")}
                    </span>
                  </div>
                  <span className={cn(
                    "text-xs font-mono font-medium tabular-nums px-2 py-0.5 rounded-md",
                    selected ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                  )}>
                    {m.params}
                  </span>
                </button>
              );
            })}
            {models.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="size-3 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
                Loading models…
              </div>
            )}
          </div>
        </div>

        {/* OpenRouter API Key section */}
        <div className="px-6 py-4 border-b space-y-3">
          <div>
            <Label htmlFor="api-key-input">OpenRouter API Key</Label>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">Optional — leave blank to use the server default from <code className="bg-muted px-1 py-0.5 rounded font-mono">.env</code>. Get a key at{" "}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">openrouter.ai/keys</a>
            </p>
          </div>
          <Input
            id="api-key-input"
            type="password"
            placeholder="sk-or-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            className="bg-muted/50 text-xs"
          />
        </div>

        {/* Image dataset section */}
        <div className="px-6 py-4 border-b space-y-4">
          <div className="flex items-center justify-between gap-6">
            <div className="min-w-0">
              <Label>Image Data Set</Label>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 max-w-[280px]">Images per category. Each model gets N hot dog + N not hot dog images.</p>
            </div>
            <div className="w-1/2 shrink-0 pt-3">
              <DualRangeSlider
                label
                lableContenPos="left"
                value={[sampleSize]}
                onValueChange={([v]) => setSampleSize(v)}
                min={1}
                max={maxImages}
                step={1}
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 py-3">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive" role="alert" aria-live="assertive">
              {error}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="p-6">
          <StatusButton
            status={batchRunning ? "success" : btnStatus}
            onClick={handleStart}
            disabled={!dataset?.downloaded || selectedModelIds.size === 0 || batchRunning}
            idleText={`Run ${selectedModelIds.size} Model${selectedModelIds.size !== 1 ? "s" : ""}`}
            loadingText="Starting"
            successText="Benchmark Running"
          />
        </div>
      </CardContent>
    </Card>
  );
}
