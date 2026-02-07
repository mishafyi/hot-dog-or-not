"use client";

import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Prediction } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PredictionCardProps {
  prediction: Prediction;
  index: number;
  isNew?: boolean;
}

export function PredictionCard({ prediction, index, isNew }: PredictionCardProps) {
  const src = api.imageUrl(prediction.split, prediction.category, prediction.filename);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 25,
        delay: index * 0.03,
      }}
      className={cn(
        "rounded-2xl border overflow-hidden bg-card group",
        isNew && "ring-2 ring-primary"
      )}
    >
      <div className="aspect-square relative bg-muted overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={prediction.filename}
          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />
        {/* Animated verdict overlay */}
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 25, delay: 0.1 + index * 0.03 }}
          className="absolute inset-x-0 bottom-0"
        >
          <div
            className={cn(
              "px-3 py-2 text-white text-sm font-bold backdrop-blur-sm",
              prediction.parsed === "error"
                ? "bg-yellow-600/85"
                : prediction.correct
                  ? "bg-green-600/85"
                  : "bg-red-600/85"
            )}
          >
            <div className="flex items-center justify-between">
              <span>
                {prediction.parsed === "error"
                  ? "ERROR"
                  : prediction.parsed === "yes"
                    ? "HOT DOG"
                    : "NOT HOT DOG"}
              </span>
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.2 + index * 0.03 }}
              >
                {prediction.parsed !== "error" && (prediction.correct ? "✓" : "✗")}
              </motion.span>
            </div>
          </div>
        </motion.div>
      </div>
      <div className="p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <Badge
            variant={prediction.category === "hot_dog" ? "default" : "secondary"}
            className="text-[10px] px-1.5 py-0"
          >
            {prediction.category === "hot_dog" ? "hot dog" : "not hot dog"}
          </Badge>
          <span className="text-[10px] text-muted-foreground font-mono">
            {prediction.latency_ms > 0 ? `${(prediction.latency_ms / 1000).toFixed(1)}s` : "-"}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground truncate" title={prediction.raw_response}>
          &ldquo;{prediction.raw_response}&rdquo;
        </p>
      </div>
    </motion.div>
  );
}
