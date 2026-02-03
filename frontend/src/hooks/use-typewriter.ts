"use client";

import { useState, useEffect } from "react";

interface UseTypewriterOptions {
  text: string;
  msPerChar?: number;
  enabled?: boolean;
}

export function useTypewriter({
  text,
  msPerChar = 16,
  enabled = true,
}: UseTypewriterOptions) {
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!enabled || !text) {
      setDisplayed(text || "");
      setIsTyping(false);
      return;
    }

    setDisplayed("");
    setIsTyping(true);

    let rafId: number;
    let start: number | null = null;

    function step(timestamp: number) {
      if (!start) start = timestamp;
      const chars = Math.min(Math.floor((timestamp - start) / msPerChar) + 1, text.length);
      setDisplayed(text.slice(0, chars));
      if (chars >= text.length) {
        setIsTyping(false);
      } else {
        rafId = requestAnimationFrame(step);
      }
    }
    rafId = requestAnimationFrame(step);

    return () => cancelAnimationFrame(rafId);
  }, [text, msPerChar, enabled]);

  return { displayed, isTyping };
}
