"use client";

import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/use-typewriter";
import { RandomizedTextEffect } from "@/components/ui/text-randomized";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ModelLogo } from "@/components/model-logo";
import type { ModelPredictionSlot } from "@/lib/types";

interface ModelReasoningPanelProps {
  models: ModelPredictionSlot[];
}

export function ModelReasoningPanel({ models }: ModelReasoningPanelProps) {
  return (
    <div className="grid gap-2 grid-cols-1 h-full auto-rows-fr">
      {models.map((slot) => (
        <ModelCard key={slot.modelId} slot={slot} />
      ))}
    </div>
  );
}

function ModelCard({ slot }: { slot: ModelPredictionSlot }) {
  const pred = slot.prediction;

  return (
    <div className="rounded-lg border bg-card px-3 py-2.5 flex flex-col gap-1.5 min-h-0 overflow-hidden">
      {/* Model header */}
      <div className="flex items-center gap-2 shrink-0">
        <ModelLogo modelId={slot.modelId} size={18} />
        <span className="text-sm font-semibold truncate flex-1">
          {slot.modelName}
        </span>
        {pred ? (
          <VerdictBadge prediction={pred} />
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
            <div className="size-2.5 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin" />
            <span>Analyzing...</span>
          </div>
        )}
      </div>

      {/* Reasoning */}
      <div className="flex-1 min-h-0">
        {pred ? (
          <ReasoningBody prediction={pred} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground/40">
            Waiting for response...
          </div>
        )}
      </div>
    </div>
  );
}

function VerdictBadge({ prediction }: { prediction: NonNullable<ModelPredictionSlot["prediction"]> }) {
  const verdictText =
    prediction.parsed === "error"
      ? "ERROR"
      : prediction.parsed === "yes"
        ? "HOT DOG"
        : "NOT HOT DOG";

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div
        className={cn(
          "px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider text-white leading-none",
          prediction.parsed === "error"
            ? "bg-yellow-600"
            : prediction.correct
              ? "bg-green-600"
              : "bg-red-600"
        )}
      >
        <RandomizedTextEffect text={verdictText} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        {prediction.latency_ms.toFixed(0)}ms
      </span>
      {prediction.parsed !== "error" && (
        <span
          className={cn(
            "text-xs font-bold leading-none",
            prediction.correct ? "text-green-500" : "text-red-500"
          )}
        >
          {prediction.correct ? "\u2713" : "\u2717"}
        </span>
      )}
    </div>
  );
}

function ReasoningBody({ prediction }: { prediction: NonNullable<ModelPredictionSlot["prediction"]> }) {
  const reasoning = prediction.reasoning || "";
  const raw = prediction.raw_response || "";
  const isError = prediction.parsed === "error";

  if (isError && raw) {
    return (
      <ScrollArea className="h-full">
        <p className="font-mono text-xs text-yellow-500/70 whitespace-pre-wrap break-words leading-relaxed pr-3">
          {raw}
        </p>
      </ScrollArea>
    );
  }

  if (reasoning) {
    return <TypewriterReasoning text={reasoning} />;
  }

  if (raw) {
    return <TypewriterReasoning text={raw} />;
  }

  return (
    <div className="h-full flex items-center justify-center">
      <p className="text-xs text-muted-foreground/50">No reasoning available</p>
    </div>
  );
}

function TypewriterReasoning({ text }: { text: string }) {
  const { displayed, isTyping } = useTypewriter({
    text,
    msPerChar: 16,
    enabled: !!text,
  });

  return (
    <ScrollArea className="h-full">
      <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words leading-relaxed pr-3">
        {displayed}
        {isTyping && (
          <span className="inline-block w-[2px] h-[12px] bg-muted-foreground align-text-bottom ml-0.5 animate-pulse" />
        )}
      </p>
    </ScrollArea>
  );
}
