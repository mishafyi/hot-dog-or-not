"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Clock, Copy, Check, ExternalLink, Zap } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { BattleRound, BattleStats } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

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

/* ── Scoreboard ─────────────────────────────────────────────── */

function ScoreHeader({ stats }: { stats: BattleStats | null }) {
  if (!stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-20 w-28" />
          <Skeleton className="h-12 w-16" />
          <Skeleton className="h-20 w-28" />
        </div>
        <Skeleton className="h-4 w-full rounded-full" />
      </div>
    );
  }

  const total = stats.nemotron_wins + stats.openclaw_wins + stats.ties;
  const nemPct = total > 0 ? (stats.nemotron_wins / total) * 100 : 50;
  const tiePct = total > 0 ? (stats.ties / total) * 100 : 0;
  const clawPct = total > 0 ? (stats.openclaw_wins / total) * 100 : 50;

  return (
    <div className="space-y-6">
      {/* Score numbers */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Image
              src="/logos/NVIDIA.webp"
              alt="NVIDIA"
              width={80}
              height={15}
              className="h-4 w-auto flex-shrink-0"
            />
            <span className="text-sm font-semibold text-muted-foreground">Nemotron</span>
          </div>
          <motion.div
            className="text-4xl font-extrabold font-mono tabular-nums text-emerald-400"
            key={stats.nemotron_wins}
            initial={{ scale: 1.2, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {stats.nemotron_wins}
          </motion.div>
          {total > 0 && (
            <span className="text-xs font-mono tabular-nums text-emerald-400/60">
              {(stats.nemotron_accuracy * 100).toFixed(0)}% acc
            </span>
          )}
        </div>

        <div className="flex flex-col items-center justify-center gap-1">
          <div className="text-4xl font-extrabold font-mono tabular-nums text-muted-foreground">
            {stats.ties}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">ties</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">OpenClaw</span>
            <span className="text-lg">🦞</span>
          </div>
          <motion.div
            className="text-4xl font-extrabold font-mono tabular-nums text-orange-400"
            key={stats.openclaw_wins}
            initial={{ scale: 1.2, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            {stats.openclaw_wins}
          </motion.div>
          {total > 0 && (
            <span className="text-xs font-mono tabular-nums text-orange-400/60">
              {(stats.openclaw_accuracy * 100).toFixed(0)}% acc
            </span>
          )}
        </div>
      </div>

      {/* Score bar */}
      <div className="space-y-2">
        <div className="h-2.5 rounded-full overflow-hidden bg-muted/50 flex">
          <motion.div
            className="bg-gradient-to-r from-emerald-500 to-emerald-400 h-full rounded-l-full"
            initial={{ width: "50%" }}
            animate={{ width: `${nemPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          {tiePct > 0 && (
            <motion.div
              className="bg-muted-foreground/20 h-full"
              initial={{ width: "0%" }}
              animate={{ width: `${tiePct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          )}
          <motion.div
            className="bg-gradient-to-r from-orange-400 to-orange-500 h-full rounded-r-full"
            initial={{ width: "50%" }}
            animate={{ width: `${clawPct}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <div className="text-center">
          <span className="text-xs font-medium text-muted-foreground/60">
            {stats.total_rounds} {stats.total_rounds === 1 ? "round" : "rounds"} played
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Verdict badge ──────────────────────────────────────────── */

function VerdictBadge({ answer, side }: { answer: string; side: "nemotron" | "openclaw" }) {
  const isYes = answer === "yes";
  const isNo = answer === "no";

  const colors = isYes
    ? "bg-green-500/10 text-green-400 border-green-500/20"
    : isNo
    ? "bg-red-500/10 text-red-400 border-red-500/20"
    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/20";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-sm bg-opacity-90 font-bold transition-colors ${colors}`}
        >
          {side === "nemotron" ? (
            <Image
              src="/logos/NVIDIA.webp"
              alt="NVIDIA"
              width={54}
              height={10}
              className="h-3.5 w-auto flex-shrink-0"
            />
          ) : (
            <span className="text-base">🦞</span>
          )}
          <span className="uppercase text-base tracking-wide">{answer}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {side === "nemotron" ? "Nemotron Nano 12B VL" : "OpenClaw"}: {answer}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Outcome indicator ──────────────────────────────────────── */

function OutcomeBadge({ winner, consensus }: { winner: string; consensus: string }) {
  if (winner === "tie" && consensus === "yes") {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
        <Check className="size-3" /> Agree: hot dog
      </Badge>
    );
  }
  if (winner === "tie" && consensus === "no") {
    return (
      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
        <Check className="size-3" /> Agree: not hot dog
      </Badge>
    );
  }
  if (winner === "tie") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Check className="size-3" /> Tie
      </Badge>
    );
  }
  if (winner === "nemotron") {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
        <Image src="/logos/NVIDIA.webp" alt="" width={48} height={9} className="h-2.5 w-auto" /> Nemotron wins
      </Badge>
    );
  }
  if (winner === "openclaw") {
    return (
      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 gap-1">
        🦞 OpenClaw wins
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1">
      <Zap className="size-3" /> Disagree
    </Badge>
  );
}

/* ── Reasoning panel ────────────────────────────────────────── */

function ReasoningPanel({
  reasoning,
  side,
}: {
  reasoning: string;
  side: "nemotron" | "openclaw";
}) {
  if (!reasoning) return null;

  const accent =
    side === "nemotron"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-orange-500/30 bg-orange-500/5";

  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {side === "nemotron" ? (
          <Image
            src="/logos/NVIDIA.webp"
            alt="NVIDIA"
            width={54}
            height={10}
            className="h-3 w-auto"
          />
        ) : (
          <span className="text-sm">🦞</span>
        )}
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {side === "nemotron" ? "Nemotron Nano 12B VL" : "OpenClaw"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {reasoning}
      </p>
    </div>
  );
}

/* ── Round card ─────────────────────────────────────────────── */

function RoundCard({ round, index }: { round: BattleRound; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const hasReasoning = round.nemotron_reasoning || round.claw_reasoning;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="overflow-hidden hover:border-border/80 transition-colors !py-0 !gap-0">
        {/* Image banner */}
        <div className="relative w-full h-40 bg-black/30">
          <img
            src={`${API_URL}/api/battle/images/${round.image_filename}`}
            alt={`Round ${index + 1}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
          <div className="absolute top-2.5 left-3">
            <span className="text-[10px] font-bold font-mono bg-black/60 backdrop-blur-sm text-white/80 px-1.5 py-0.5 rounded">
              #{index + 1}
            </span>
          </div>
          <div className="absolute top-2.5 right-3 flex items-center gap-1.5">
            {round.source && (
              <span className="text-[10px] font-medium bg-orange-500/30 backdrop-blur-sm text-orange-200 px-1.5 py-0.5 rounded">
                via {round.source}
              </span>
            )}
            <span className="text-[10px] font-medium bg-black/50 backdrop-blur-sm text-white/70 px-1.5 py-0.5 rounded">
              {timeAgo(round.timestamp)}
            </span>
          </div>

          {/* Verdicts overlaid at bottom of image */}
          <div className="absolute bottom-3 inset-x-0 grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4">
            <div className="flex justify-end">
              <VerdictBadge answer={round.nemotron_answer} side="nemotron" />
            </div>
            <span className="text-white/70 text-sm font-black uppercase tracking-widest drop-shadow-lg">VS</span>
            <div className="flex justify-start">
              <VerdictBadge answer={round.claw_answer} side="openclaw" />
            </div>
          </div>
        </div>

        {/* Outcome row */}
        <div className="px-4 py-3 flex items-center justify-center gap-3">
          <OutcomeBadge winner={round.winner} consensus={round.consensus} />
          {round.nemotron_latency_ms > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400/50 font-mono tabular-nums">
                  <Clock className="size-3" />
                  {(round.nemotron_latency_ms / 1000).toFixed(1)}s
                </span>
              </TooltipTrigger>
              <TooltipContent>Nemotron inference latency</TooltipContent>
            </Tooltip>
          )}
          {round.claw_latency_ms && round.claw_latency_ms > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[11px] text-orange-400/50 font-mono tabular-nums">
                  <Clock className="size-3" />
                  {(round.claw_latency_ms / 1000).toFixed(1)}s
                </span>
              </TooltipTrigger>
              <TooltipContent>OpenClaw inference latency</TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Why button */}
        {hasReasoning && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full border-t border-border/30 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors flex items-center justify-center gap-1.5"
          >
            <ChevronDown
              className={`size-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
        )}

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
              <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3">
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

/* ── CTA card ───────────────────────────────────────────────── */

const PKG_MANAGERS = ["npm", "pnpm", "bun"] as const;
type PkgManager = (typeof PKG_MANAGERS)[number];

const INSTALL_CMDS: Record<PkgManager, string> = {
  npm: "npx clawhub@latest install hotdog",
  pnpm: "pnpm dlx clawhub@latest install hotdog",
  bun: "bunx clawhub@latest install hotdog",
};

function InstallCTA() {
  const [copied, setCopied] = useState(false);
  const [pkg, setPkg] = useState<PkgManager>("npm");
  const cmd = INSTALL_CMDS[pkg];

  function handleCopy() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="group relative overflow-hidden rounded-xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-background p-8 shadow-sm">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/5 blur-3xl transition-all group-hover:bg-orange-500/10" />

      <div className="relative z-10 space-y-5">
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-bold">Join the battle</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Install the skill, send a food photo, and battle Nemotron in real time.
          </p>
        </div>

        {/* Package manager switcher */}
        <div className="flex items-center justify-center gap-1">
          {PKG_MANAGERS.map((pm) => (
            <Button
              key={pm}
              variant={pkg === pm ? "default" : "ghost"}
              size="sm"
              onClick={() => setPkg(pm)}
              className={`text-xs font-mono px-3 h-7 rounded-full ${
                pkg === pm
                  ? "bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/30"
                  : "text-muted-foreground/60 hover:text-orange-400"
              }`}
            >
              {pm}
            </Button>
          ))}
        </div>

        {/* Install command */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-0 rounded-lg border border-orange-500/20 bg-card overflow-hidden">
            <code className="px-4 py-2.5 text-sm font-mono text-orange-400">
              {cmd}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="rounded-none border-l border-orange-500/20 h-full px-3 text-muted-foreground hover:text-orange-400"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground/50">
          <a
            href="https://clawhub.ai/skills/hotdog"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-orange-400 transition-colors"
          >
            Browse on ClawHub <ExternalLink className="size-3" />
          </a>
          <span>Powered by OpenClaw + NVIDIA Nemotron</span>
        </div>
      </div>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

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

  const sortedRounds = [...rounds].reverse();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-emerald-400">Nemotron</span>
          {" "}vs{" "}
          <span className="text-orange-400">OpenClaw</span>
        </h1>
        <p className="text-sm text-muted-foreground/70">
          AI vision battle — who&apos;s better at spotting hot dogs?
        </p>
      </div>

      {/* Scoreboard */}
      <div className="group relative overflow-hidden rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/5 via-background to-orange-500/5 p-8 shadow-sm">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-orange-500/5 blur-3xl" />
        <div className="relative z-10">
          <ScoreHeader stats={stats} />
        </div>
      </div>

      {/* Feed header */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50">
          Recent rounds
        </h2>
        <div className="flex-1 h-px bg-border/50" />
        {rounds.length > 0 && (
          <span className="text-xs font-mono tabular-nums text-muted-foreground/40">
            {rounds.length}
          </span>
        )}
      </div>

      {/* Feed */}
      <div className="space-y-3">
        {loading && rounds.length === 0 ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="w-full h-40" />
              <div className="p-4 flex flex-col items-center gap-3">
                <div className="flex gap-3">
                  <Skeleton className="h-8 w-20 rounded-lg" />
                  <Skeleton className="h-8 w-20 rounded-lg" />
                </div>
                <Skeleton className="h-5 w-36 rounded-full" />
              </div>
            </Card>
          ))
        ) : sortedRounds.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="space-y-3">
              <div className="text-4xl">🌭</div>
              <p className="text-muted-foreground font-medium">
                No rounds yet
              </p>
              <p className="text-sm text-muted-foreground/60">
                Install the skill and send a food photo to start the battle.
              </p>
            </div>
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
      <InstallCTA />
    </div>
  );
}
