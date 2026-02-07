"use client";

import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Prediction } from "@/lib/types";

export function ImageResultCard({ prediction }: { prediction: Prediction }) {
  const src = api.imageUrl(
    prediction.split,
    prediction.category,
    prediction.filename
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="aspect-square relative bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={prediction.filename}
          className="object-cover w-full h-full"
          loading="lazy"
        />
      </div>
      <div className="p-2 space-y-1">
        <div className="flex items-center gap-1.5">
          <Badge
            variant={prediction.correct ? "default" : "destructive"}
            className="text-xs"
          >
            {prediction.correct ? "Correct" : prediction.parsed === "error" ? "Error" : "Wrong"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {prediction.latency_ms.toFixed(0)}ms
          </span>
        </div>
        <p className="text-xs truncate text-muted-foreground" title={prediction.raw_response}>
          &ldquo;{prediction.raw_response}&rdquo;
        </p>
        <p className="text-xs text-muted-foreground">
          Truth: {prediction.category === "hot_dog" ? "Hot Dog" : "Not Hot Dog"}
        </p>
      </div>
    </div>
  );
}
