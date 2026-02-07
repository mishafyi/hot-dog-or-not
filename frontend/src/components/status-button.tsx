"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";

interface StatusButtonProps {
  status: "idle" | "loading" | "success";
  onClick: () => void;
  disabled?: boolean;
  idleText?: string;
  loadingText?: string;
  successText?: string;
}

export function StatusButton({
  status,
  onClick,
  disabled = false,
  idleText = "Start Benchmark",
  loadingText = "Starting",
  successText = "Started",
}: StatusButtonProps) {
  const text = useMemo(() => {
    switch (status) {
      case "idle":
        return idleText;
      case "loading":
        return loadingText;
      case "success":
        return successText;
    }
  }, [status, idleText, loadingText, successText]);

  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="relative inline-flex group font-sans w-full">
      <Button
        onClick={onClick}
        className={cn(
          "relative rounded-full h-12 px-8 text-base font-medium transition-colors duration-300 w-full disabled:opacity-100",
          status === "idle"
            ? "transition-colors"
            : "bg-muted text-muted-foreground hover:bg-muted cursor-not-allowed border-muted shadow-sm"
        )}
        variant="default"
        disabled={status !== "idle" || disabled}
      >
        <span className="flex items-center justify-center">
          <AnimatePresence mode="popLayout" initial={false}>
            {text.split("").map((char, i) => (
              <motion.span
                key={`${char}-${i}-${status}`}
                layout={!prefersReducedMotion}
                initial={prefersReducedMotion ? false : { opacity: 0, scale: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0, filter: "blur(4px)" }}
                transition={prefersReducedMotion ? { duration: 0 } : {
                  type: "spring",
                  stiffness: 500,
                  damping: 30,
                  mass: 1,
                }}
                className="inline-block"
              >
                {char === " " ? "\u00A0" : char}
              </motion.span>
            ))}
          </AnimatePresence>
        </span>
      </Button>

      <div className={cn("absolute -top-1 -right-1 z-10 pointer-events-none")}>
        <AnimatePresence mode="wait">
          {status !== "idle" && (
            <motion.div
              initial={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              animate={{ opacity: 1, scale: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0, x: -8, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={cn(
                "flex items-center justify-center size-6 rounded-full ring-3 overflow-visible",
                status === "success"
                  ? "bg-primary text-primary-foreground ring-muted"
                  : "bg-muted text-muted-foreground ring-muted"
              )}
            >
              <AnimatePresence mode="popLayout">
                {status === "loading" && (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" className="animate-spin">
                      <path fill="currentColor" d="M12 2A10 10 0 1 0 22 12A10 10 0 0 0 12 2Zm0 18a8 8 0 1 1 8-8A8 8 0 0 1 12 20Z" opacity=".5" />
                      <path fill="currentColor" d="M20 12h2A10 10 0 0 0 12 2V4A8 8 0 0 1 20 12Z" />
                    </svg>
                  </motion.div>
                )}
                {status === "success" && (
                  <motion.div
                    key="check"
                    initial={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0, opacity: 0, filter: "blur(4px)" }}
                    transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <HugeiconsIcon icon={Tick02Icon} className="size-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
