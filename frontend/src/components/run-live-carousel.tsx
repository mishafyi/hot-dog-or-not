"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTypewriter } from "@/hooks/use-typewriter";
import { RandomizedTextEffect } from "@/components/ui/text-randomized";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Prediction } from "@/lib/types";
import type { QueuedImage } from "@/components/run-live-feed";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface RunLiveCarouselProps {
  queue: QueuedImage[];
  isActive: boolean;
  isCompleted: boolean;
  compact?: boolean;
  modelName?: string;
}

const ITEM_HEIGHT = 52;
const AUTO_PLAY_INTERVAL = 4000;
const MS_PER_CHAR = 16;
const MIN_DISPLAY_MS = 2500;
const POST_TYPING_PAUSE_MS = 1500;

const wrap = (min: number, max: number, v: number) => {
  const rangeSize = max - min;
  return ((((v - min) % rangeSize) + rangeSize) % rangeSize) + min;
};

// ── Reasoning Panel ──────────────────────────────────────────────

function ReasoningPanel({ prediction, compact }: { prediction: Prediction | null; compact?: boolean }) {
  if (!prediction) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground/50",
        compact ? "py-3" : "py-8"
      )}>
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/50 animate-spin" />
          Waiting for AI response...
        </div>
      </div>
    );
  }

  const reasoning = prediction.reasoning || "";
  const raw = prediction.raw_response || "";
  const verdictText =
    prediction.parsed === "error"
      ? "ERROR"
      : prediction.parsed === "yes"
        ? "HOT DOG"
        : "NOT HOT DOG";

  return (
    <div className={compact ? "space-y-1.5" : "space-y-3"}>
      {/* Verdict with randomized reveal */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white",
            prediction.parsed === "error"
              ? "bg-yellow-600"
              : prediction.correct
                ? "bg-green-600"
                : "bg-red-600"
          )}
        >
          <RandomizedTextEffect text={verdictText} />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {prediction.latency_ms.toFixed(0)}ms
        </span>
        {prediction.parsed !== "error" && (
          <span
            className={cn(
              "text-sm font-bold",
              prediction.correct ? "text-green-500" : "text-red-500"
            )}
          >
            {prediction.correct ? "\u2713" : "\u2717"}
          </span>
        )}
      </div>

      {/* Reasoning / Raw response */}
      {reasoning ? (
        <ReasoningContent text={reasoning} compact={compact} />
      ) : raw ? (
        <div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
            Response
          </span>
          <p className={cn(
            "font-mono text-muted-foreground mt-1",
            compact ? "text-xs" : "text-sm"
          )}>
            &ldquo;{raw}&rdquo;
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground/50">
          No reasoning available
        </p>
      )}
    </div>
  );
}

function ReasoningContent({ text, compact }: { text: string; compact?: boolean }) {
  const { displayed, isTyping } = useTypewriter({
    text,
    msPerChar: 16,
    enabled: !!text,
  });

  return (
    <ScrollArea className={cn(compact ? "h-[100px]" : "h-[160px]")}>
      <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed pr-3">
        {displayed}
        {isTyping && <BlinkingCaret />}
      </p>
    </ScrollArea>
  );
}

function BlinkingCaret() {
  return (
    <span className="inline-block w-[2px] h-[14px] bg-muted-foreground align-text-bottom ml-0.5 animate-pulse" />
  );
}

// ── Results Summary Card ─────────────────────────────────────────

function ResultsSummaryCard({
  queue,
  isActive: isActiveCard,
  isPrev,
  isNext,
}: {
  queue: QueuedImage[];
  isActive: boolean;
  isPrev: boolean;
  isNext: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const completed = queue.filter((q) => q.prediction !== null);
  const correct = completed.filter((q) => q.prediction!.correct).length;
  const errors = completed.filter((q) => q.prediction!.parsed === "error").length;
  const wrong = completed.length - correct - errors;
  const accuracy = completed.length > 0 ? (correct / completed.length) * 100 : 0;
  const avgLatency =
    completed.length > 0
      ? completed.reduce((sum, q) => sum + q.prediction!.latency_ms, 0) / completed.length
      : 0;

  return (
    <motion.div
      key="__results__"
      initial={false}
      animate={{
        x: isActiveCard ? 0 : isPrev ? -80 : isNext ? 80 : 0,
        scale: isActiveCard ? 1 : isPrev || isNext ? 0.85 : 0.7,
        opacity: isActiveCard ? 1 : isPrev || isNext ? 0.4 : 0,
        rotate: isPrev ? -3 : isNext ? 3 : 0,
        zIndex: isActiveCard ? 20 : isPrev || isNext ? 10 : 0,
      }}
      transition={prefersReducedMotion ? { duration: 0 } : {
        type: "spring",
        stiffness: 260,
        damping: 25,
        mass: 0.8,
      }}
      className="absolute inset-0 rounded-2xl overflow-hidden border-4 border-background origin-center"
      style={{ pointerEvents: isActiveCard ? "auto" : "none" }}
    >
      <div className="w-full h-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex flex-col items-center justify-center gap-6 p-8">
        {/* Accuracy */}
        <div className="text-center">
          <div
            className={cn(
              "text-6xl font-black tabular-nums tracking-tight",
              accuracy === 100
                ? "text-green-400"
                : accuracy >= 80
                  ? "text-emerald-400"
                  : accuracy >= 50
                    ? "text-yellow-400"
                    : "text-red-400"
            )}
          >
            <RandomizedTextEffect text={`${accuracy.toFixed(1)}%`} />
          </div>
          <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-widest">
            Accuracy
          </p>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <span className="text-green-400 font-bold text-lg tabular-nums">{correct}</span>
            <p className="text-zinc-500 text-xs">correct</p>
          </div>
          <div className="w-px h-8 bg-zinc-700" />
          <div className="text-center">
            <span className="text-red-400 font-bold text-lg tabular-nums">{wrong}</span>
            <p className="text-zinc-500 text-xs">wrong</p>
          </div>
          {errors > 0 && (
            <>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <span className="text-yellow-400 font-bold text-lg tabular-nums">{errors}</span>
                <p className="text-zinc-500 text-xs">errors</p>
              </div>
            </>
          )}
          <div className="w-px h-8 bg-zinc-700" />
          <div className="text-center">
            <span className="text-zinc-300 font-bold text-lg tabular-nums">{avgLatency.toFixed(0)}</span>
            <span className="text-zinc-500 text-xs">ms</span>
            <p className="text-zinc-500 text-xs">avg latency</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full max-w-[280px]">
          <div className="h-2 rounded-full bg-zinc-700 overflow-hidden flex">
            {correct > 0 && (
              <div
                className="h-full bg-green-500"
                style={{ width: `${(correct / completed.length) * 100}%` }}
              />
            )}
            {wrong > 0 && (
              <div
                className="h-full bg-red-500"
                style={{ width: `${(wrong / completed.length) * 100}%` }}
              />
            )}
            {errors > 0 && (
              <div
                className="h-full bg-yellow-500"
                style={{ width: `${(errors / completed.length) * 100}%` }}
              />
            )}
          </div>
          <p className="text-zinc-500 text-xs text-center mt-2">
            {completed.length} / {queue.length} images
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function ResultsSummaryPanel({ queue }: { queue: QueuedImage[] }) {
  const completed = queue.filter((q) => q.prediction !== null);
  const correct = completed.filter((q) => q.prediction!.correct).length;
  const accuracy = completed.length > 0 ? (correct / completed.length) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider text-white",
            accuracy === 100 ? "bg-green-600" : accuracy >= 80 ? "bg-emerald-600" : accuracy >= 50 ? "bg-yellow-600" : "bg-red-600"
          )}
        >
          <RandomizedTextEffect text="RUN COMPLETE" />
        </div>
        <span className="font-mono text-xs text-muted-foreground">
          {accuracy.toFixed(1)}% accuracy
        </span>
      </div>
      <p className="font-mono text-xs text-muted-foreground leading-relaxed">
        Processed {completed.length} images — {correct} correct, {completed.length - correct} incorrect.
      </p>
    </div>
  );
}

// ── Main Carousel ─────────────────────────────────────────────────

export function RunLiveCarousel({ queue, isActive, isCompleted, compact, modelName }: RunLiveCarouselProps) {
  const [step, setStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const prevCompletedRef = useRef(0);

  const imageCount = queue.length;
  const allPredicted = queue.length > 0 && queue.every((q) => q.prediction !== null);
  const showResults = isCompleted || allPredicted;
  // Total slides: images + optional results slide
  const totalSlides = imageCount + (showResults ? 1 : 0);
  const resultsIndex = imageCount; // results slide is at end

  const currentIndex = totalSlides > 0 ? ((step % totalSlides) + totalSlides) % totalSlides : 0;
  const isOnResults = currentIndex === resultsIndex && showResults;

  // Find the index of the first pending image (next to be processed)
  const firstPendingIndex = queue.findIndex((q) => q.prediction === null);
  const completedCount = queue.filter((q) => q.prediction !== null).length;

  // Auto-advance to the latest prediction when a new one arrives
  useEffect(() => {
    if (completedCount > prevCompletedRef.current && isActive) {
      // Jump to the most recently completed prediction
      const latestCompleted = completedCount - 1;
      setStep(latestCompleted);

      // Wait for reasoning typewriter to finish before advancing
      if (firstPendingIndex >= 0) {
        const pred = queue[latestCompleted]?.prediction;
        const reasoningLen = pred?.reasoning?.length || pred?.raw_response?.length || 0;
        const typingDuration = reasoningLen * MS_PER_CHAR;
        const delay = Math.max(MIN_DISPLAY_MS, typingDuration + POST_TYPING_PAUSE_MS);
        const timer = setTimeout(() => {
          setStep(firstPendingIndex);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
    prevCompletedRef.current = completedCount;
  }, [completedCount, firstPendingIndex, isActive, queue]);

  // Auto-advance to results slide when all predictions are in
  const prevAllPredictedRef = useRef(false);
  useEffect(() => {
    if (allPredicted && !prevAllPredictedRef.current && imageCount > 0) {
      // Wait for the last reasoning to finish typing before showing results
      const lastPred = queue[imageCount - 1]?.prediction;
      const reasoningLen = lastPred?.reasoning?.length || lastPred?.raw_response?.length || 0;
      const typingDuration = reasoningLen * MS_PER_CHAR;
      const delay = Math.max(MIN_DISPLAY_MS, typingDuration + POST_TYPING_PAUSE_MS);
      const timer = setTimeout(() => {
        setStep(resultsIndex);
      }, delay);
      prevAllPredictedRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!allPredicted) prevAllPredictedRef.current = false;
  }, [allPredicted, imageCount, resultsIndex, queue]);

  // Auto-play cycling (only when not live and not completed)
  const nextStep = useCallback(() => {
    setStep((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (isPaused || isActive || showResults) return;
    const interval = setInterval(nextStep, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [nextStep, isPaused, isActive, showResults]);

  const goPrev = useCallback(() => {
    setStep((prev) => prev - 1);
  }, []);

  const goNext = useCallback(() => {
    setStep((prev) => prev + 1);
  }, []);

  const handleChipClick = (index: number) => {
    setStep(index);
  };

  const getCardStatus = (index: number) => {
    const diff = index - currentIndex;
    const len = totalSlides;
    if (len <= 1) return index === currentIndex ? "active" : "hidden";

    let normalizedDiff = diff;
    if (diff > len / 2) normalizedDiff -= len;
    if (diff < -len / 2) normalizedDiff += len;

    if (normalizedDiff === 0) return "active";
    if (normalizedDiff === -1) return "prev";
    if (normalizedDiff === 1) return "next";
    return "hidden";
  };

  if (imageCount === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-0 rounded-2xl border overflow-hidden",
        compact ? "flex-col min-h-[280px]" : "flex-col lg:flex-row min-h-[480px]"
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Left Panel: Chip List (hidden in compact mode) ── */}
      {!compact && (
        <div className="w-full lg:w-[220px] shrink-0 relative bg-muted/40 flex items-center overflow-hidden">
          {/* Top/bottom fade gradients */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-muted/40 to-transparent z-40" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-muted/40 to-transparent z-40" />

          <div className="relative w-full h-full flex items-center justify-center lg:justify-start px-4 py-4">
            {queue.map((item, index) => {
              const isActiveChip = index === currentIndex;
              const distance = index - currentIndex;
              const wrappedDistance =
                totalSlides > 2
                  ? wrap(-(totalSlides / 2), totalSlides / 2, distance)
                  : distance;

              if (Math.abs(wrappedDistance) > 4) return null;

              const src = api.imageUrl(item.split, item.category, item.filename);
              const pred = item.prediction;
              const isPending = pred === null;

              const statusIcon = isPending
                ? "\u2022"
                : pred.parsed === "error"
                  ? "!"
                  : pred.correct
                    ? "\u2713"
                    : "\u2717";
              const statusColor = isPending
                ? "text-muted-foreground/40"
                : pred.parsed === "error"
                  ? "text-yellow-500"
                  : pred.correct
                    ? "text-green-500"
                    : "text-red-500";

              return (
                <motion.div
                  key={`${item.split}/${item.category}/${item.filename}`}
                  style={{ height: ITEM_HEIGHT, width: "100%" }}
                  animate={{
                    y: wrappedDistance * ITEM_HEIGHT,
                    opacity: 1 - Math.abs(wrappedDistance) * 0.2,
                  }}
                  transition={prefersReducedMotion ? { duration: 0 } : {
                    type: "spring",
                    stiffness: 90,
                    damping: 22,
                    mass: 1,
                  }}
                  className="absolute flex items-center"
                >
                  <button
                    onClick={() => handleChipClick(index)}
                    className={cn(
                      "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-left transition-colors duration-500 cursor-pointer border",
                      isActiveChip
                        ? "bg-background shadow-md border-border z-10"
                        : "bg-transparent border-transparent hover:border-border/40",
                      isPending && "opacity-60"
                    )}
                  >
                    <div
                      className={cn(
                        "size-8 rounded-lg overflow-hidden shrink-0 bg-muted",
                        isPending && "grayscale"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt={`${item.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${item.filename}`}
                        className="object-cover w-full h-full"
                        loading="lazy"
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs truncate flex-1 transition-colors duration-500",
                        isActiveChip
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {item.filename}
                    </span>
                    <span
                      className={cn("text-sm font-bold shrink-0", statusColor)}
                    >
                      {statusIcon}
                    </span>
                  </button>
                </motion.div>
              );
            })}

            {/* Results chip */}
            {showResults && (() => {
              const isActiveChip = currentIndex === resultsIndex;
              const distance = resultsIndex - currentIndex;
              const wrappedDistance =
                totalSlides > 2
                  ? wrap(-(totalSlides / 2), totalSlides / 2, distance)
                  : distance;

              return (
                <motion.div
                  key="__results_chip__"
                  style={{ height: ITEM_HEIGHT, width: "100%" }}
                  animate={{
                    y: wrappedDistance * ITEM_HEIGHT,
                    opacity: 1 - Math.abs(wrappedDistance) * 0.2,
                  }}
                  transition={prefersReducedMotion ? { duration: 0 } : {
                    type: "spring",
                    stiffness: 90,
                    damping: 22,
                    mass: 1,
                  }}
                  className="absolute flex items-center"
                >
                  <button
                    onClick={() => handleChipClick(resultsIndex)}
                    className={cn(
                      "flex items-center gap-2.5 w-full rounded-xl px-3 py-2 text-left transition-colors duration-500 cursor-pointer border",
                      isActiveChip
                        ? "bg-background shadow-md border-border z-10"
                        : "bg-transparent border-transparent hover:border-border/40"
                    )}
                  >
                    <div className="size-8 rounded-lg overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                      <span className="text-base">&#x2261;</span>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold flex-1 transition-colors duration-500",
                        isActiveChip ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      Results
                    </span>
                  </button>
                </motion.div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── Right Panel (or only panel in compact mode) ── */}
      <div className={cn(
        "flex-1 flex flex-col bg-secondary/20",
        !compact && "border-t lg:border-t-0 lg:border-l border-border/20"
      )}>
        {/* Image Cards — stacked carousel */}
        <div className={cn(
          "flex-1 relative flex items-center justify-center overflow-hidden",
          compact ? "p-4 min-h-[200px]" : "p-6 lg:p-8 min-h-[280px]"
        )}>
          {/* Model name badge (compact mode) */}
          {compact && modelName && (
            <div className="absolute top-3 right-3 z-30">
              <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full">
                {modelName}
              </span>
            </div>
          )}
          {/* Prev / Next buttons */}
          {totalSlides > 1 && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={goPrev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 z-30 size-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                    aria-label="Previous image"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Previous</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={goNext}
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-30 size-8 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center hover:bg-black/70 transition-colors"
                    aria-label="Next image"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </TooltipTrigger>
                <TooltipContent>Next</TooltipContent>
              </Tooltip>
            </>
          )}
          <div className={cn(
            "relative w-full aspect-[4/3]",
            compact ? "max-w-[360px]" : "max-w-[480px]"
          )}>
            {queue.map((item, index) => {
              const status = getCardStatus(index);
              if (status === "hidden") return null;
              const isActiveCard = status === "active";
              const isPrev = status === "prev";
              const isNext = status === "next";
              const src = api.imageUrl(
                item.split,
                item.category,
                item.filename
              );
              const pred = item.prediction;
              const isPending = pred === null;

              const verdictLabel = isPending
                ? ""
                : pred.parsed === "error"
                  ? "ERROR"
                  : pred.parsed === "yes"
                    ? "HOT DOG"
                    : "NOT HOT DOG";
              const verdictColor = isPending
                ? ""
                : pred.parsed === "error"
                  ? "bg-yellow-600/85"
                  : pred.correct
                    ? "bg-green-600/85"
                    : "bg-red-600/85";

              return (
                <motion.div
                  key={`${item.split}/${item.category}/${item.filename}`}
                  initial={false}
                  animate={{
                    x: isActiveCard ? 0 : isPrev ? -80 : isNext ? 80 : 0,
                    scale: isActiveCard
                      ? 1
                      : isPrev || isNext
                        ? 0.85
                        : 0.7,
                    opacity: isActiveCard
                      ? 1
                      : isPrev || isNext
                        ? 0.4
                        : 0,
                    rotate: isPrev ? -3 : isNext ? 3 : 0,
                    zIndex: isActiveCard ? 20 : isPrev || isNext ? 10 : 0,
                  }}
                  transition={prefersReducedMotion ? { duration: 0 } : {
                    type: "spring",
                    stiffness: 260,
                    damping: 25,
                    mass: 0.8,
                  }}
                  className="absolute inset-0 rounded-2xl overflow-hidden border-4 border-background bg-background origin-center"
                  style={{
                    pointerEvents: isActiveCard ? "auto" : "none",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${item.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${item.filename}`}
                    className={cn(
                      "w-full h-full object-cover transition-[filter] duration-700",
                      isActiveCard
                        ? "grayscale-0 blur-0"
                        : "grayscale blur-[2px] brightness-75"
                    )}
                  />

                  {/* Pending overlay — scanning effect */}
                  {isActiveCard && isPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2"
                      >
                        <div className="size-2.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        <span className="text-white text-sm font-medium">
                          Analyzing...
                        </span>
                      </motion.div>
                    </div>
                  )}

                  {/* Verdict overlay */}
                  <AnimatePresence>
                    {isActiveCard && !isPending && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-between pointer-events-none"
                      >
                        <div
                          className={cn(
                            "px-3 py-1.5 rounded-full text-white text-sm font-bold",
                            verdictColor
                          )}
                        >
                          {verdictLabel}
                        </div>
                        <span className="text-white text-xl font-bold">
                          {pred!.parsed !== "error" &&
                            (pred!.correct ? "\u2713" : "\u2717")}
                        </span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Live indicator */}
                  {isActiveCard && isActive && (
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)] animate-pulse" />
                      <span className="text-white/80 text-[10px] font-medium uppercase tracking-widest font-mono">
                        Live
                      </span>
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Results summary card */}
            {showResults && (() => {
              const status = getCardStatus(resultsIndex);
              return (
                <ResultsSummaryCard
                  queue={queue}
                  isActive={status === "active"}
                  isPrev={status === "prev"}
                  isNext={status === "next"}
                />
              );
            })()}
          </div>
        </div>

        {/* Reasoning / Results Panel */}
        <div className={cn("border-t border-border/20", compact ? "p-3" : "p-4")} aria-live="polite">
          {isOnResults ? (
            <ResultsSummaryPanel queue={queue} />
          ) : (
            <ReasoningPanel
              key={`${queue[currentIndex >= imageCount ? 0 : currentIndex]?.split}/${queue[currentIndex >= imageCount ? 0 : currentIndex]?.category}/${queue[currentIndex >= imageCount ? 0 : currentIndex]?.filename}`}
              prediction={queue[currentIndex >= imageCount ? 0 : currentIndex]?.prediction ?? null}
              compact={compact}
            />
          )}
        </div>
      </div>
    </div>
  );
}
