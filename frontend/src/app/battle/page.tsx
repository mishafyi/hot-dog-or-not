"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { BattleRound, BattleStats } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ScoreHeader({ stats }: { stats: BattleStats | null }) {
  if (!stats) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  const total = stats.nemotron_wins + stats.openclaw_wins + stats.ties;
  const nemPct = total > 0 ? (stats.nemotron_wins / total) * 100 : 50;
  const tiePct = total > 0 ? (stats.ties / total) * 100 : 0;
  const clawPct = total > 0 ? (stats.openclaw_wins / total) * 100 : 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-center">
          <div className="text-3xl font-bold font-mono text-emerald-400">
            {stats.nemotron_wins}
          </div>
          <div className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <span className="text-lg">🤖</span> Nemotron
          </div>
        </div>

        <div className="text-center px-4">
          <div className="text-2xl font-bold font-mono text-muted-foreground">
            {stats.ties}
          </div>
          <div className="text-xs text-muted-foreground">ties</div>
        </div>

        <div className="text-center">
          <div className="text-3xl font-bold font-mono text-orange-400">
            {stats.openclaw_wins}
          </div>
          <div className="text-sm text-muted-foreground font-medium flex items-center gap-1.5">
            <span className="text-lg">🦞</span> OpenClaw
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-3 rounded-full overflow-hidden bg-muted flex">
        <motion.div
          className="bg-emerald-500 h-full"
          initial={{ width: "50%" }}
          animate={{ width: `${nemPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div
          className="bg-muted-foreground/30 h-full"
          initial={{ width: "0%" }}
          animate={{ width: `${tiePct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
        <motion.div
          className="bg-orange-500 h-full"
          initial={{ width: "50%" }}
          animate={{ width: `${clawPct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {stats.total_rounds} rounds played
      </div>
    </div>
  );
}

function VerdictBadge({ answer, side }: { answer: string; side: "nemotron" | "openclaw" }) {
  const color =
    answer === "yes"
      ? "bg-green-500/15 text-green-400 border-green-500/30"
      : answer === "no"
      ? "bg-red-500/15 text-red-400 border-red-500/30"
      : "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";

  const icon = side === "nemotron" ? "🤖" : "🦞";

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-sm font-medium ${color}`}>
      <span>{icon}</span>
      <span>{answer}</span>
    </div>
  );
}

function WinnerBadge({ winner }: { winner: string }) {
  if (winner === "tie") {
    return <Badge variant="secondary">Tie</Badge>;
  }
  if (winner === "nemotron") {
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">🤖 Nemotron wins</Badge>;
  }
  if (winner === "openclaw") {
    return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">🦞 OpenClaw wins</Badge>;
  }
  return <Badge variant="outline">Disagree</Badge>;
}

function ReasoningPanel({
  reasoning,
  side,
}: {
  reasoning: string;
  side: "nemotron" | "openclaw";
}) {
  if (!reasoning) return null;

  const borderColor =
    side === "nemotron" ? "border-emerald-500/20" : "border-orange-500/20";

  return (
    <div className={`mt-2 pl-3 border-l-2 ${borderColor}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {side === "nemotron" ? (
          <Image
            src="/logos/NVIDIA.webp"
            alt="NVIDIA"
            width={14}
            height={14}
            className="rounded-sm"
          />
        ) : (
          <span className="text-sm">🦞</span>
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {side === "nemotron" ? "Nemotron Nano 12B VL" : "OpenClaw"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground/80 leading-relaxed">
        {reasoning}
      </p>
    </div>
  );
}

function RoundCard({ round, index }: { round: BattleRound; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = round.nemotron_reasoning || round.claw_reasoning;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="p-4">
        <div className="flex gap-4">
          {/* Image thumbnail */}
          <div className="flex-shrink-0">
            <img
              src={`${API_URL}/api/battle/images/${round.image_filename}`}
              alt={`Round ${index + 1}`}
              className="w-20 h-20 rounded-lg object-cover bg-muted"
            />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">
                Round #{index + 1}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(round.timestamp)}
              </span>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <VerdictBadge answer={round.nemotron_answer} side="nemotron" />
              <span className="text-muted-foreground text-xs">vs</span>
              <VerdictBadge answer={round.claw_answer} side="openclaw" />
            </div>

            <div className="flex items-center gap-2">
              <WinnerBadge winner={round.winner} />
              {round.nemotron_latency_ms > 0 && (
                <span className="text-xs text-muted-foreground">
                  {(round.nemotron_latency_ms / 1000).toFixed(1)}s
                </span>
              )}
              {hasReasoning && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                  {expanded ? "Less" : "Why?"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Expandable reasoning */}
        <AnimatePresence>
          {expanded && hasReasoning && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="mt-3 pt-3 border-t border-border/50 space-y-3">
                <ReasoningPanel
                  reasoning={round.nemotron_reasoning}
                  side="nemotron"
                />
                <ReasoningPanel
                  reasoning={round.claw_reasoning}
                  side="openclaw"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}

export default function BattlePage() {
  const [rounds, setRounds] = useState<BattleRound[]>([]);
  const [stats, setStats] = useState<BattleStats | null>(null);
  const [loading, setLoading] = useState(true);
  const lastIndexRef = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [newRounds, newStats] = await Promise.all([
        api.getBattleFeed(lastIndexRef.current),
        api.getBattleStats(),
      ]);
      if (newRounds.length > 0) {
        lastIndexRef.current += newRounds.length;
        setRounds((prev) => [...prev, ...newRounds]);
      }
      setStats(newStats);
    } catch {
      // Silently retry on next poll
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Show newest first
  const sortedRounds = [...rounds].reverse();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold">
          <span className="text-emerald-400">Nemotron</span>
          {" "}vs{" "}
          <span className="text-orange-400">OpenClaw</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          AI vision battle — who&apos;s better at spotting hot dogs?
        </p>
      </div>

      {/* Scoreboard */}
      <Card className="p-6">
        <ScoreHeader stats={stats} />
      </Card>

      {/* Feed */}
      <div className="space-y-3">
        {loading && rounds.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex gap-4">
                <Skeleton className="w-20 h-20 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-5 w-32" />
                </div>
              </div>
            </Card>
          ))
        ) : sortedRounds.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              No rounds yet. Send a food photo to start the battle!
            </p>
          </Card>
        ) : (
          <AnimatePresence mode="popLayout">
            {sortedRounds.map((round, i) => (
              <RoundCard
                key={round.round_id}
                round={round}
                index={rounds.length - 1 - i}
              />
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* CTA */}
      <Card className="p-6 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          Send a photo via WhatsApp to join the battle
        </p>
        <p className="text-xs text-muted-foreground/60">
          Powered by OpenClaw + Nemotron
        </p>
      </Card>
    </div>
  );
}
