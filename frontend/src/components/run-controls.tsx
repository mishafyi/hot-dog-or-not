"use client";

import { useState, useEffect } from "react";
import { DualRangeSlider } from "@/components/uilayouts/slider";
import { StatusButton } from "@/components/status-button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ModelLogo } from "@/components/model-logo";
import type { ModelInfo, AvailableModel, DatasetStatus } from "@/lib/types";

const SLOT_COUNT = 4;
const NONE_VALUE = "__none__";

interface RunControlsProps {
  onBatchStarted: (runIds: Record<string, string>, batchId: string) => void;
  batchRunning?: boolean;
}

export function RunControls({ onBatchStarted, batchRunning = false }: RunControlsProps) {
  const [defaultModels, setDefaultModels] = useState<ModelInfo[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  // 4 slots: each holds a model ID or null
  const [slots, setSlots] = useState<(string | null)[]>(Array(SLOT_COUNT).fill(null));
  const [dataset, setDataset] = useState<DatasetStatus | null>(null);
  const [sampleSize, setSampleSize] = useState<number>(5);
  const [apiKey, setApiKey] = useState<string>("");
  const [btnStatus, setBtnStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load default models and pre-select them
    api.getModels().then((m) => {
      setDefaultModels(m);
      setSlots(m.slice(0, SLOT_COUNT).map((model) => model.id).concat(
        Array(Math.max(0, SLOT_COUNT - m.length)).fill(null)
      ));
    }).catch(console.error);

    // Load available models from OpenRouter
    api.getAvailableModels()
      .then(setAvailableModels)
      .catch((err) => {
        console.error("Failed to load available models:", err);
      })
      .finally(() => setLoadingModels(false));

    api.getDatasetStatus().then(setDataset).catch(console.error);
  }, []);

  const maxImages = dataset
    ? Math.min(dataset.hot_dog_count, dataset.not_hot_dog_count)
    : 23;

  const activeModelIds = slots.filter((s): s is string => s !== null);
  const activeCount = activeModelIds.length;

  const setSlotModel = (index: number, modelId: string | null) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = modelId;
      return next;
    });
  };

  // Build unified option list: defaults first, then others
  const defaultIds = new Set(defaultModels.map((m) => m.id));
  const otherModels = availableModels.filter((m) => !defaultIds.has(m.id));

  const handleStart = async () => {
    setBtnStatus("loading");
    setError(null);
    try {
      const size = sampleSize > 0 && sampleSize < maxImages ? sampleSize : undefined;
      const result = await api.startBatchRun(size, apiKey || undefined, activeModelIds);
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

        {/* Models section — dropdowns */}
        <div className="px-6 py-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label>Models</Label>
              <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                Free vision models from OpenRouter — pick up to {SLOT_COUNT}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {activeCount} active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {slots.map((selectedId, index) => {
              // Models selected in OTHER slots (to filter from this dropdown)
              const otherSelected = new Set(
                slots.filter((s, i): s is string => s !== null && i !== index)
              );

              return (
                <ModelSlotDropdown
                  key={index}
                  index={index}
                  selectedId={selectedId}
                  defaultModels={defaultModels}
                  otherModels={otherModels}
                  otherSelected={otherSelected}
                  loading={loadingModels}
                  onChange={(id) => setSlotModel(index, id)}
                />
              );
            })}
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
            disabled={!dataset?.downloaded || activeCount === 0 || batchRunning}
            idleText={`Run ${activeCount} Model${activeCount !== 1 ? "s" : ""}`}
            loadingText="Starting"
            successText="Benchmark Running"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ModelSlotDropdown({
  index,
  selectedId,
  defaultModels,
  otherModels,
  otherSelected,
  loading,
  onChange,
}: {
  index: number;
  selectedId: string | null;
  defaultModels: ModelInfo[];
  otherModels: AvailableModel[];
  otherSelected: Set<string>;
  loading: boolean;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="shrink-0 w-5 flex justify-center">
        {selectedId ? (
          <ModelLogo modelId={selectedId} size={20} />
        ) : (
          <span className="text-xs text-muted-foreground/40 font-mono">{index + 1}</span>
        )}
      </div>
      <Select
        value={selectedId ?? NONE_VALUE}
        onValueChange={(v) => onChange(v === NONE_VALUE ? null : v)}
      >
        <SelectTrigger
          className={cn(
            "w-full text-xs",
            selectedId
              ? "border-green-500/40 bg-green-500/10"
              : "border-muted-foreground/20 bg-muted/50"
          )}
        >
          <SelectValue placeholder="Select a model…" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-[300px]">
          <SelectItem value={NONE_VALUE}>
            <span className="text-muted-foreground">— None —</span>
          </SelectItem>
          <SelectSeparator />

          {/* Default / recommended models */}
          <SelectGroup>
            <SelectLabel>Default</SelectLabel>
            {defaultModels.map((m) => (
              <SelectItem
                key={m.id}
                value={m.id}
                disabled={otherSelected.has(m.id)}
              >
                <span className="truncate">{m.name}</span>
                <span className="ml-1 text-muted-foreground font-mono text-[10px]">{m.params}</span>
              </SelectItem>
            ))}
          </SelectGroup>

          {/* Other OpenRouter free vision models */}
          {otherModels.length > 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>
                  {loading ? "Loading…" : "OpenRouter Free Vision"}
                </SelectLabel>
                {otherModels.map((m) => (
                  <SelectItem
                    key={m.id}
                    value={m.id}
                    disabled={otherSelected.has(m.id)}
                  >
                    <span className="truncate">{m.name}</span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}

          {loading && otherModels.length === 0 && (
            <>
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel>Loading more models…</SelectLabel>
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
