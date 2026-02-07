"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { RandomizedTextEffect } from "@/components/ui/text-randomized";
import { ModelReasoningPanel } from "@/components/model-reasoning-panel";
import { ModelLogo } from "@/components/model-logo";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import type { ImageSlot } from "@/lib/types";

interface UnifiedCarouselProps {
  slots: ImageSlot[];
  isActive: boolean;
  isCompleted: boolean;
  modelCount: number;
}

const AUTO_PLAY_INTERVAL = 4000;
const MS_PER_CHAR = 16;
const MIN_DISPLAY_MS = 2500;
const POST_TYPING_PAUSE_MS = 1500;


// ── Results Summary Card ─────────────────────────────────────────

function ResultsSummaryCard({
  slots,
  isActive: isActiveCard,
  isPrev,
  isNext,
}: {
  slots: ImageSlot[];
  isActive: boolean;
  isPrev: boolean;
  isNext: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();

  // Aggregate across all models
  const modelIds = slots[0]?.models.map((m) => m.modelId) ?? [];
  const modelStats = modelIds.map((modelId) => {
    const preds = slots
      .map((s) => s.models.find((m) => m.modelId === modelId)?.prediction)
      .filter(Boolean);
    const correct = preds.filter((p) => p!.correct).length;
    const errors = preds.filter((p) => p!.parsed === "error").length;
    return { modelId, total: preds.length, correct, errors, wrong: preds.length - correct - errors };
  });
  const totalPreds = modelStats.reduce((s, m) => s + m.total, 0);
  const totalCorrect = modelStats.reduce((s, m) => s + m.correct, 0);
  const totalWrong = modelStats.reduce((s, m) => s + m.wrong, 0);
  const totalErrors = modelStats.reduce((s, m) => s + m.errors, 0);
  const accuracy = totalPreds > 0 ? (totalCorrect / totalPreds) * 100 : 0;

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
        <div className="text-center">
          <div
            className={cn(
              "text-6xl font-black tabular-nums tracking-tight",
              accuracy === 100 ? "text-green-400"
                : accuracy >= 80 ? "text-emerald-400"
                  : accuracy >= 50 ? "text-yellow-400"
                    : "text-red-400"
            )}
          >
            <RandomizedTextEffect text={`${accuracy.toFixed(1)}%`} />
          </div>
          <p className="text-zinc-400 text-sm font-medium mt-1 uppercase tracking-widest">
            Overall Accuracy
          </p>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="text-center">
            <span className="text-green-400 font-bold text-lg tabular-nums">{totalCorrect}</span>
            <p className="text-zinc-500 text-xs">correct</p>
          </div>
          <div className="w-px h-8 bg-zinc-700" />
          <div className="text-center">
            <span className="text-red-400 font-bold text-lg tabular-nums">{totalWrong}</span>
            <p className="text-zinc-500 text-xs">wrong</p>
          </div>
          {totalErrors > 0 && (
            <>
              <div className="w-px h-8 bg-zinc-700" />
              <div className="text-center">
                <span className="text-yellow-400 font-bold text-lg tabular-nums">{totalErrors}</span>
                <p className="text-zinc-500 text-xs">errors</p>
              </div>
            </>
          )}
        </div>

        <div className="w-full max-w-[280px]">
          <div className="h-2 rounded-full bg-zinc-700 overflow-hidden flex">
            {totalCorrect > 0 && (
              <div className="h-full bg-green-500" style={{ width: `${(totalCorrect / totalPreds) * 100}%` }} />
            )}
            {totalWrong > 0 && (
              <div className="h-full bg-red-500" style={{ width: `${(totalWrong / totalPreds) * 100}%` }} />
            )}
            {totalErrors > 0 && (
              <div className="h-full bg-yellow-500" style={{ width: `${(totalErrors / totalPreds) * 100}%` }} />
            )}
          </div>
          <p className="text-zinc-500 text-xs text-center mt-2">
            {slots.filter((s) => s.allModelsComplete).length} / {slots.length} images &middot; {modelIds.length} models
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Main Unified Carousel ─────────────────────────────────────────

export function UnifiedCarousel({ slots, isActive, isCompleted, modelCount }: UnifiedCarouselProps) {
  const [step, setStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const prevCompleteCountRef = useRef(0);

  const imageCount = slots.length;
  const allComplete = slots.length > 0 && slots.every((s) => s.allModelsComplete);
  const showResults = isCompleted || allComplete;
  const totalSlides = imageCount + (showResults ? 1 : 0);
  const resultsIndex = imageCount;

  const currentIndex = totalSlides > 0 ? ((step % totalSlides) + totalSlides) % totalSlides : 0;
  const isOnResults = currentIndex === resultsIndex && showResults;

  // Count of images where all models are complete
  const completeCount = slots.filter((s) => s.allModelsComplete).length;
  // Index of first image where NOT all models have responded
  const firstIncompleteIndex = slots.findIndex((s) => !s.allModelsComplete);

  // Auto-advance when all models complete for an image
  useEffect(() => {
    if (completeCount > prevCompleteCountRef.current && isActive) {
      // Jump to the most recently completed image
      const latestComplete = completeCount - 1;
      setStep(latestComplete);

      // Wait for longest reasoning typewriter, then advance to next incomplete
      if (firstIncompleteIndex >= 0) {
        const slot = slots[latestComplete];
        const maxReasoningLen = slot
          ? Math.max(...slot.models.map((m) => m.prediction?.reasoning?.length || m.prediction?.raw_response?.length || 0))
          : 0;
        const typingDuration = maxReasoningLen * MS_PER_CHAR;
        const delay = Math.max(MIN_DISPLAY_MS, typingDuration + POST_TYPING_PAUSE_MS);
        const timer = setTimeout(() => {
          setStep(firstIncompleteIndex);
        }, delay);
        return () => clearTimeout(timer);
      }
    }
    prevCompleteCountRef.current = completeCount;
  }, [completeCount, firstIncompleteIndex, isActive, slots]);

  // Auto-advance to results slide when fully complete
  const prevAllCompleteRef = useRef(false);
  useEffect(() => {
    if (allComplete && !prevAllCompleteRef.current && imageCount > 0) {
      const lastSlot = slots[imageCount - 1];
      const maxReasoningLen = lastSlot
        ? Math.max(...lastSlot.models.map((m) => m.prediction?.reasoning?.length || m.prediction?.raw_response?.length || 0))
        : 0;
      const typingDuration = maxReasoningLen * MS_PER_CHAR;
      const delay = Math.max(MIN_DISPLAY_MS, typingDuration + POST_TYPING_PAUSE_MS);
      const timer = setTimeout(() => {
        setStep(resultsIndex);
      }, delay);
      prevAllCompleteRef.current = true;
      return () => clearTimeout(timer);
    }
    if (!allComplete) prevAllCompleteRef.current = false;
  }, [allComplete, imageCount, resultsIndex, slots]);

  // Auto-play cycling (only when not live and not completed)
  const nextStep = useCallback(() => {
    setStep((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (isPaused || isActive || showResults) return;
    const interval = setInterval(nextStep, AUTO_PLAY_INTERVAL);
    return () => clearInterval(interval);
  }, [nextStep, isPaused, isActive, showResults]);

  const goPrev = useCallback(() => setStep((prev) => prev - 1), []);
  const goNext = useCallback(() => setStep((prev) => prev + 1), []);
  const handleChipClick = (index: number) => setStep(index);

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

  const currentSlot = currentIndex < imageCount ? slots[currentIndex] : null;
  const modelsComplete = currentSlot ? currentSlot.models.filter((m) => m.prediction !== null).length : 0;

  return (
    <div
      className="flex flex-col lg:flex-row gap-0 rounded-2xl border overflow-hidden min-h-[520px] lg:h-[580px]"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* ── Content Area: Image + Reasoning side by side ── */}
      <div className="flex-1 flex flex-col lg:flex-row bg-secondary/20 min-h-0">
        {/* Image Cards */}
        <div className="relative flex items-center justify-center overflow-hidden p-6 lg:p-10 min-h-[320px] lg:w-[55%] shrink-0">
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

          <div className="relative w-full max-w-[480px] aspect-[4/3]">
            {slots.map((item, index) => {
              const status = getCardStatus(index);
              if (status === "hidden") return null;
              const isActiveCard = status === "active";
              const isPrevCard = status === "prev";
              const isNextCard = status === "next";
              const src = api.imageUrl(item.split, item.category, item.filename);
              const anyPending = item.models.some((m) => m.prediction === null);
              const completeCount2 = item.models.filter((m) => m.prediction !== null).length;

              return (
                <motion.div
                  key={item.imageKey}
                  initial={false}
                  animate={{
                    x: isActiveCard ? 0 : isPrevCard ? -80 : isNextCard ? 80 : 0,
                    scale: isActiveCard ? 1 : isPrevCard || isNextCard ? 0.85 : 0.7,
                    opacity: isActiveCard ? 1 : isPrevCard || isNextCard ? 0.4 : 0,
                    rotate: isPrevCard ? -3 : isNextCard ? 3 : 0,
                    zIndex: isActiveCard ? 20 : isPrevCard || isNextCard ? 10 : 0,
                  }}
                  transition={prefersReducedMotion ? { duration: 0 } : {
                    type: "spring",
                    stiffness: 260,
                    damping: 25,
                    mass: 0.8,
                  }}
                  className="absolute inset-0 rounded-2xl overflow-hidden border-4 border-background bg-background origin-center"
                  style={{ pointerEvents: isActiveCard ? "auto" : "none" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={`${item.category === "hot_dog" ? "Hot dog" : "Food (not hot dog)"} - ${item.filename}`}
                    className={cn(
                      "w-full h-full object-cover transition-[filter] duration-700",
                      isActiveCard ? "grayscale-0 blur-0" : "grayscale blur-[2px] brightness-75"
                    )}
                  />

                  {/* Pending overlay — waiting for models */}
                  {isActiveCard && anyPending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2"
                      >
                        <div className="size-2.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        <span className="text-white text-sm font-medium">
                          Waiting for models... ({completeCount2}/{modelCount})
                        </span>
                      </motion.div>
                    </div>
                  )}

                  {/* All complete — show aggregated verdict */}
                  <AnimatePresence>
                    {isActiveCard && item.allModelsComplete && (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute inset-x-0 bottom-0 p-4 pt-16 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex items-end justify-between pointer-events-none"
                      >
                        {(() => {
                          const correctCount = item.models.filter((m) => m.prediction!.correct).length;
                          const total = item.models.length;
                          const allCorrect = correctCount === total;
                          const allWrong = correctCount === 0;
                          return (
                            <>
                              <div
                                className={cn(
                                  "px-3 py-1.5 rounded-full text-white text-sm font-bold",
                                  allCorrect ? "bg-green-600/85" : allWrong ? "bg-red-600/85" : "bg-yellow-600/85"
                                )}
                              >
                                {allCorrect ? "ALL CORRECT" : allWrong ? "ALL WRONG" : `${correctCount}/${total} CORRECT`}
                              </div>
                              <span className="text-white/70 text-xs font-mono">
                                {item.category === "hot_dog" ? "Hot Dog" : "Not Hot Dog"}
                              </span>
                            </>
                          );
                        })()}
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
                  slots={slots}
                  isActive={status === "active"}
                  isPrev={status === "prev"}
                  isNext={status === "next"}
                />
              );
            })()}
          </div>
        </div>

        {/* Multi-model reasoning panel — right side on desktop, below on mobile */}
        <div className="border-t lg:border-t-0 lg:border-l border-border/20 p-3 lg:p-4 lg:w-[45%] lg:min-h-0 flex flex-col overflow-hidden" aria-live="polite">
          {isOnResults ? (
            <ResultsSummaryPanel slots={slots} />
          ) : currentSlot ? (
            <ModelReasoningPanel key={currentSlot.imageKey} models={currentSlot.models} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ResultsSummaryPanel({ slots }: { slots: ImageSlot[] }) {
  const models = slots[0]?.models ?? [];

  return (
    <div className="grid gap-2 grid-cols-1 h-full auto-rows-fr">
      {models.map((m) => {
        const preds = slots
          .map((s) => s.models.find((sm) => sm.modelId === m.modelId)?.prediction)
          .filter(Boolean);
        const total = preds.length;
        const correct = preds.filter((p) => p!.correct).length;
        const errors = preds.filter((p) => p!.parsed === "error").length;
        const wrong = total - correct - errors;
        const accuracy = total > 0 ? (correct / total) * 100 : 0;
        const avgLatency = preds.length > 0
          ? preds.reduce((s, p) => s + p!.latency_ms, 0) / preds.length
          : 0;

        return (
          <div key={m.modelId} className="rounded-lg border bg-card px-3 py-2.5 flex flex-col gap-2 min-h-0 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-2">
              <ModelLogo modelId={m.modelId} size={18} />
              <span className="text-sm font-semibold truncate flex-1">
                {m.modelName}
              </span>
              <span className={cn(
                "text-sm font-mono font-bold tabular-nums",
                accuracy >= 80 ? "text-green-400"
                  : accuracy >= 50 ? "text-yellow-400"
                    : "text-red-400"
              )}>
                {accuracy.toFixed(1)}%
              </span>
            </div>
            {/* Stats */}
            <div className="flex items-center gap-2 text-xs tabular-nums">
              <span className="text-green-500 font-medium">{correct} correct</span>
              <span className="text-muted-foreground/30">|</span>
              <span className="text-red-500 font-medium">{wrong} wrong</span>
              {errors > 0 && (
                <>
                  <span className="text-muted-foreground/30">|</span>
                  <span className="text-yellow-500 font-medium">{errors} err</span>
                </>
              )}
              <span className="text-muted-foreground/40 ml-auto font-mono">{avgLatency.toFixed(0)}ms avg</span>
            </div>
            {/* Progress bar */}
            <div className="h-2 rounded-full bg-muted overflow-hidden flex">
              {correct > 0 && (
                <div className="h-full bg-green-500 transition-all" style={{ width: `${(correct / total) * 100}%` }} />
              )}
              {wrong > 0 && (
                <div className="h-full bg-red-500 transition-all" style={{ width: `${(wrong / total) * 100}%` }} />
              )}
              {errors > 0 && (
                <div className="h-full bg-yellow-500 transition-all" style={{ width: `${(errors / total) * 100}%` }} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
