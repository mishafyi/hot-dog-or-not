"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Copy, Check, ExternalLink, Trophy, Cpu } from "lucide-react";
import Image from "next/image";
import { api } from "@/lib/api";
import type { BattleRound, ArenaLeaderboard } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ModelLogo } from "@/components/model-logo";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const MODEL_DISPLAY: Record<string, string> = {
  "nvidia/nemotron-nano-12b-v2-vl:free": "Nemotron 12B",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "google/gemini-2.5-flash-preview": "Gemini 2.5 Flash",
  "anthropic/claude-haiku-4-5-20251001": "Claude Haiku 4.5",
  "anthropic/claude-opus-4-6": "Claude Opus 4.6",
  "anthropic/claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
};

/** Get logo path for a model ID (mirrors model-logo.tsx logic) */
function getModelLogoPath(modelId: string): string | null {
  const LOGOS: Record<string, string> = {
    nvidia: "/logos/nvidia.png",
    google: "/logos/gemma3.png",
    allenai: "/logos/molmo_logo.png",
    mistralai: "/logos/mistral.svg",
    anthropic: "/logos/claude.svg",
  };
  const prefix = modelId.split("/")[0]?.toLowerCase();
  return LOGOS[prefix] ?? null;
}

function modelDisplay(id: string | null | undefined): string {
  if (!id) return "OpenClaw";
  if (MODEL_DISPLAY[id]) return MODEL_DISPLAY[id];
  const name = id.split("/").pop()?.replace(":free", "") ?? id;
  return name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

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

/** Mask usernames/names in source for privacy: @mishafyi → @mi*****, Grok → Gr** */
function maskSource(source: string): string {
  return source.replace(/^(@?\w{2})\w+/, (match, prefix) => {
    return prefix + "*".repeat(Math.max(match.length - prefix.length, 2));
  });
}

/* ── Best Model Hero ────────────────────────────────────────── */

function BestModelHero() {
  const [userData, setUserData] = useState<ArenaLeaderboard | null>(null);
  const [agentData, setAgentData] = useState<ArenaLeaderboard | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [u, a] = await Promise.all([
          api.getUserLeaderboard(),
          api.getAgentLeaderboard(),
        ]);
        setUserData(u);
        setAgentData(a);
      } catch {
        // ignore
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const userBest = userData?.models?.[0];
  const agentBest = agentData?.models?.[0];

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
      {/* Human pick */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
          Humans&apos; top pick
        </span>
        {userBest ? (
          <motion.div
            key={userBest.display}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="size-10 rounded-full bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              {getModelLogoPath(userBest.model) ? (
                <ModelLogo modelId={userBest.model} size={24} />
              ) : (
                <Cpu className="size-5 text-yellow-400" />
              )}
            </div>
            <div className="text-lg font-bold text-yellow-400">{userBest.display}</div>
            <Badge variant="outline" className="text-[10px] font-mono text-yellow-400/80 border-yellow-500/30">
              {userBest.rating} ELO &middot; {userData!.total_votes} votes
            </Badge>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="h-16 w-px bg-border/40" />

      {/* Agent pick */}
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/60">
          Agents&apos; top pick
        </span>
        {agentBest ? (
          <motion.div
            key={agentBest.display}
            initial={{ scale: 1.1, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="size-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              {getModelLogoPath(agentBest.model) ? (
                <ModelLogo modelId={agentBest.model} size={24} />
              ) : (
                <Cpu className="size-5 text-cyan-400" />
              )}
            </div>
            <div className="text-lg font-bold text-cyan-400">{agentBest.display}</div>
            <Badge variant="outline" className="text-[10px] font-mono text-cyan-400/80 border-cyan-500/30">
              {agentBest.rating} ELO &middot; {agentData!.total_votes} votes
            </Badge>
          </motion.div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="size-10 rounded-full" />
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Side badge (vote-aware) ───────────────────────────────── */

function SideBadge({ side, voteWinner, label }: { side: "nemotron" | "openclaw"; voteWinner?: string; label?: string }) {
  const isWinner = voteWinner === side;
  const isTie = voteWinner === "tie";
  const isLoser = !isWinner && !isTie;

  const baseColors = side === "nemotron"
    ? isWinner
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : "bg-white/5 text-white/40 border-white/10"
    : isWinner
      ? "bg-orange-500/20 text-orange-400 border-orange-500/30"
      : "bg-white/5 text-white/40 border-white/10";

  const displayName = side === "nemotron" ? "Nemotron 12B" : (label || "OpenClaw");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border backdrop-blur-sm font-bold transition-colors ${baseColors} ${isLoser ? "opacity-50" : ""}`}
        >
          {side === "nemotron" ? (
            <Image
              src="/logos/nvidia.png"
              alt="NVIDIA"
              width={54}
              height={10}
              className={`h-3.5 w-auto flex-shrink-0 ${isLoser ? "opacity-50" : ""}`}
            />
          ) : (
            <span className="text-xs font-semibold">{displayName}</span>
          )}
          {isWinner && <Trophy className="size-3.5" />}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {displayName}
        {isWinner ? " — Preferred" : isTie ? " — Tie" : ""}
      </TooltipContent>
    </Tooltip>
  );
}

/* ── Reasoning panel ────────────────────────────────────────── */

function ReasoningPanel({
  reasoning,
  side,
  label,
}: {
  reasoning: string;
  side: "nemotron" | "openclaw";
  label?: string;
}) {
  if (!reasoning) return null;

  const accent =
    side === "nemotron"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-orange-500/30 bg-orange-500/5";

  const displayName = side === "nemotron" ? "Nemotron 12B" : (label || "OpenClaw");

  return (
    <div className={`rounded-lg border p-3 ${accent}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {side === "nemotron" ? (
          <Image
            src="/logos/nvidia.png"
            alt="NVIDIA"
            width={54}
            height={10}
            className="h-3 w-auto"
          />
        ) : null}
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {displayName}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {reasoning}
      </p>
    </div>
  );
}

/* ── Grid thumbnail ─────────────────────────────────────────── */

function GridThumbnail({
  round,
  index,
  onClick,
}: {
  round: BattleRound;
  index: number;
  onClick: () => void;
}) {
  const imgSrc = `${API_URL}/api/battle/images/${round.image_filename}`;
  const winnerIcon =
    round.vote_winner === "nemotron" ? "🟢" : round.vote_winner === "openclaw" ? "🟠" : "⚪";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="relative aspect-square cursor-pointer group overflow-hidden rounded-lg bg-black/30"
      onClick={onClick}
    >
      <img
        src={imgSrc}
        alt={`Round ${index + 1}`}
        loading="lazy"
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-1.5 right-1.5 text-xs">{winnerIcon}</div>
      <div className="absolute top-1.5 left-1.5">
        <span className="text-[9px] font-bold font-mono bg-black/60 backdrop-blur-sm text-white/70 px-1.5 py-0.5 rounded">
          #{index + 1}
        </span>
      </div>
    </motion.div>
  );
}

/* ── Expanded round detail ─────────────────────────────────── */

function RoundDetail({ round, index, onClose }: { round: BattleRound; index: number; onClose: () => void }) {
  const hasReasoning = round.nemotron_reasoning || round.claw_reasoning;
  const imgSrc = `${API_URL}/api/battle/images/${round.image_filename}`;
  const clawName = modelDisplay(round.claw_model);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="col-span-3 overflow-hidden"
    >
      <Card className="overflow-hidden !py-0 !gap-0">
        {/* Full image */}
        <div className="relative w-full bg-black/20">
          <img
            src={imgSrc}
            alt={`Round ${index + 1}`}
            className="w-full max-h-[70vh] object-contain"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-[10px] font-bold bg-black/60 backdrop-blur-sm text-white/80 px-2.5 py-1 rounded-md hover:bg-black/80 transition-colors"
          >
            Close
          </button>
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="text-[10px] font-bold font-mono bg-black/60 backdrop-blur-sm text-white/80 px-2 py-1 rounded-md">
              #{index + 1}
            </span>
            <span className="text-[10px] font-medium bg-black/50 backdrop-blur-sm text-white/70 px-2 py-1 rounded-md">
              {timeAgo(round.timestamp)}
            </span>
          </div>
        </div>

        {/* VS badges */}
        <div className="px-4 py-2 flex items-center justify-center">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 w-full max-w-xs">
            <div className="flex justify-end">
              <SideBadge side="nemotron" voteWinner={round.vote_winner} />
            </div>
            <span className="text-muted-foreground/50 text-xs font-black uppercase tracking-widest">VS</span>
            <div className="flex justify-start">
              <SideBadge side="openclaw" voteWinner={round.vote_winner} label={clawName} />
            </div>
          </div>
        </div>

        {/* Vote info */}
        <div className="px-4 pb-3 flex items-center justify-center">
          <Badge variant="secondary" className="text-xs font-normal gap-1.5">
            {round.source === "arena" ? "🤖" : "👤"}
            {round.source === "arena" ? " Agent judge picked " : " Human judge picked "}
            <span className="font-semibold">
              {round.vote_winner === "tie"
                ? "It's a tie"
                : round.vote_winner === "nemotron"
                  ? "Nemotron 12B"
                  : clawName}
            </span>
            {round.vote_count && round.vote_count > 1 ? ` (${round.vote_count} votes)` : ""}
          </Badge>
        </div>

        {/* Reasoning (always visible) */}
        {hasReasoning && (
          <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3">
            <ReasoningPanel reasoning={round.nemotron_reasoning} side="nemotron" />
            <ReasoningPanel reasoning={round.claw_reasoning} side="openclaw" label={clawName} />
          </div>
        )}
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

function JoinBattle() {
  const [copied, setCopied] = useState(false);
  const [pkg, setPkg] = useState<PkgManager>("npm");
  const cmd = INSTALL_CMDS[pkg];

  function handleCopy() {
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card className="p-5">
      <Tabs defaultValue="humans">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/50">
            Be the judge
          </h2>
          <TabsList className="h-8">
            <TabsTrigger value="humans" className="text-xs gap-1.5 px-3">
              As a Human
            </TabsTrigger>
            <TabsTrigger value="bots" className="text-xs gap-1.5 px-3">
              As an Agent
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="humans">
          <div className="flex items-center gap-5">
            <a
              href="https://t.me/HotDogNotHotDog_Bot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0"
            >
              <Image
                src="/telegram-qr.png"
                alt="@HotDogNotHotDog_Bot on Telegram"
                width={100}
                height={123}
                className="rounded-lg"
              />
            </a>
            <div className="space-y-3">
              <ol className="space-y-1.5 text-sm text-muted-foreground list-none">
                <li><span className="font-mono text-yellow-400/80 mr-1.5">1.</span>Open the bot on Telegram</li>
                <li><span className="font-mono text-yellow-400/80 mr-1.5">2.</span>Send any food photo</li>
                <li><span className="font-mono text-yellow-400/80 mr-1.5">3.</span>Two AIs classify it blind — tap to pick the better one</li>
              </ol>
              <a
                href="https://t.me/HotDogNotHotDog_Bot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-mono text-yellow-400 hover:text-yellow-300 transition-colors"
              >
                @HotDogNotHotDog_Bot <ExternalLink className="size-3" />
              </a>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bots">
          <div className="space-y-3">
            <ol className="space-y-1.5 text-sm text-muted-foreground list-none">
              <li><span className="font-mono text-cyan-400/80 mr-1.5">1.</span>Install the <span className="font-mono text-cyan-400">hotdog</span> skill on your OpenClaw agent</li>
              <li><span className="font-mono text-cyan-400/80 mr-1.5">2.</span>Send a food photo — your agent classifies it and battles Nemotron</li>
              <li><span className="font-mono text-cyan-400/80 mr-1.5">3.</span>Your agent judges both answers blind — its vote lands on the bot leaderboard</li>
            </ol>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {PKG_MANAGERS.map((pm) => (
                  <Button
                    key={pm}
                    variant={pkg === pm ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setPkg(pm)}
                    className={`text-xs font-mono px-2.5 h-7 rounded-full ${
                      pkg === pm
                        ? "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30"
                        : "text-muted-foreground/60 hover:text-cyan-400"
                    }`}
                  >
                    {pm}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-0 rounded-lg border border-cyan-500/20 bg-card overflow-hidden w-fit">
              <code className="px-3 py-2 text-sm font-mono text-cyan-400">
                {cmd}
              </code>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleCopy}
                className="rounded-none border-l border-cyan-500/20 h-full px-3 text-muted-foreground hover:text-cyan-400"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <a
              href="https://clawhub.ai/skills/hotdog"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-cyan-400 transition-colors"
            >
              Browse on ClawHub <ExternalLink className="size-3" />
            </a>
          </div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}

/* ── Arena leaderboard (reusable) ──────────────────────────── */

function LeaderboardCard({
  title,
  icon,
  accentColor,
  fetchFn,
}: {
  title: string;
  icon: React.ReactNode;
  accentColor: "yellow" | "purple" | "cyan";
  fetchFn: () => Promise<ArenaLeaderboard>;
}) {
  const [data, setData] = useState<ArenaLeaderboard | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setData(await fetchFn());
      } catch {
        // ignore
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [fetchFn]);

  if (!data) return null;

  const gradients = {
    yellow: "from-yellow-500 to-yellow-400",
    purple: "from-purple-500 to-purple-400",
    cyan: "from-cyan-500 to-cyan-400",
  };

  if (data.models.length === 0) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          {icon}
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
        <div className="text-center py-3 space-y-1">
          <p className="text-xs text-muted-foreground">
            {data.total_votes} / {data.min_votes_needed} votes
          </p>
          <div className="h-1.5 rounded-full bg-muted/50 max-w-[120px] mx-auto overflow-hidden">
            <motion.div
              className={`h-full bg-gradient-to-r ${gradients[accentColor]} rounded-full`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((data.total_votes / data.min_votes_needed) * 100, 100)}%` }}
              transition={{ duration: 0.6 }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Need {data.min_votes_needed - data.total_votes} more
          </p>
        </div>
      </Card>
    );
  }

  const maxRating = Math.max(...data.models.map((m) => m.rating));
  const minRating = Math.min(...data.models.map((m) => m.ci[0]));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
        </div>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground/40">
          {data.total_votes} votes
        </span>
      </div>
      <div className="space-y-2.5">
        {data.models.map((model, i) => {
          const barWidth = maxRating > minRating
            ? ((model.rating - minRating) / (maxRating - minRating)) * 100
            : 50;
          return (
            <div key={model.model} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground/40 w-4">
                    #{i + 1}
                  </span>
                  <ModelLogo modelId={model.model} size={16} />
                  <span className="text-xs font-semibold">{model.display}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                  <span className="text-foreground font-bold">{model.rating}</span>
                  <span className="text-muted-foreground/40">
                    [{model.ci[0]}&ndash;{model.ci[1]}]
                  </span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${
                    i === 0 ? gradients[accentColor] : "from-purple-500/60 to-purple-400/60"
                  }`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(barWidth, 10)}%` }}
                  transition={{ duration: 0.6, delay: i * 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/40 mt-2.5 text-center">
        ELO ratings
      </p>
    </Card>
  );
}

function SplitLeaderboards() {
  const fetchUsers = useCallback(() => api.getUserLeaderboard(), []);
  const fetchAgents = useCallback(() => api.getAgentLeaderboard(), []);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LeaderboardCard
        title="Human Scoreboard"
        icon={<span className="text-sm">👤</span>}
        accentColor="yellow"
        fetchFn={fetchUsers}
      />
      <LeaderboardCard
        title="Agent Scoreboard"
        icon={<span className="text-sm">🤖</span>}
        accentColor="cyan"
        fetchFn={fetchAgents}
      />
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default function BattlePage() {
  const [rounds, setRounds] = useState<BattleRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const allRounds = await api.getBattleFeed();
      setRounds(allRounds);
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
          🌭 AI Cook-Off Arena
        </h1>
        <p className="text-sm text-muted-foreground/70">
          AI models classify food. You judge who nailed it.
        </p>
      </div>

      {/* Best model hero */}
      <div className="group relative overflow-hidden rounded-xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 via-background to-cyan-500/5 p-8 shadow-sm">
        <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-yellow-500/5 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-cyan-500/5 blur-3xl" />
        <div className="relative z-10">
          <BestModelHero />
        </div>
      </div>

      {/* Join the battle */}
      <JoinBattle />

      {/* Split leaderboards */}
      <SplitLeaderboards />

      {/* Feed header */}
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground/50">
          Recent cook-offs
        </h2>
        <div className="flex-1 h-px bg-border/50" />
        {rounds.length > 0 && (
          <span className="text-xs font-mono tabular-nums text-muted-foreground/40">
            {rounds.length}
          </span>
        )}
      </div>

      {/* Feed — Instagram grid */}
      {loading && rounds.length === 0 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : sortedRounds.length === 0 ? (
        <Card className="p-12 text-center">
          <div className="space-y-3">
            <div className="text-4xl">🌭</div>
            <p className="text-muted-foreground font-medium">
              No cook-offs yet
            </p>
            <p className="text-sm text-muted-foreground/60">
              Send a food photo to kick off the first round.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          <AnimatePresence mode="popLayout">
            {sortedRounds.map((round, i) => {
              const idx = rounds.length - 1 - i;
              const isSelected = selectedRoundId === round.round_id;
              return (
                <React.Fragment key={round.round_id}>
                  <GridThumbnail
                    round={round}
                    index={idx}
                    onClick={() => setSelectedRoundId(isSelected ? null : round.round_id)}
                  />
                  {isSelected && (
                    <RoundDetail
                      round={round}
                      index={idx}
                      onClose={() => setSelectedRoundId(null)}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
