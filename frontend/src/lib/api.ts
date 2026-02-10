import type {
  DatasetStatus,
  ModelInfo,
  AvailableModel,
  LeaderboardEntry,
  ModelDetail,
  Prediction,
  ImagePrediction,
  RunStatusResponse,
  RunMeta,
  BatchRunResponse,
  BattleRound,
  BattleStats,
  ArenaLeaderboard,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function deleteJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const api = {
  getDatasetStatus: () => fetchJson<DatasetStatus>("/api/dataset/status"),

  listDatasetImages: (category?: string, limit = 1000, offset = 0) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (category) params.set("category", category);
    return fetchJson<Array<{ split: string; category: string; filename: string; path: string }>>(
      `/api/dataset/images?${params}`
    );
  },

  getModels: () => fetchJson<ModelInfo[]>("/api/models"),

  getAvailableModels: () => fetchJson<AvailableModel[]>("/api/available-models"),

  getLeaderboard: () =>
    fetchJson<LeaderboardEntry[]>("/api/results/leaderboard"),

  getModelDetail: (modelId: string) =>
    fetchJson<ModelDetail>(`/api/results/model/${encodeURIComponent(modelId)}`),

  getModelPredictions: (modelId: string, filter?: string) => {
    const params = filter ? `?filter=${filter}` : "";
    return fetchJson<Prediction[]>(
      `/api/results/model/${encodeURIComponent(modelId)}/predictions${params}`
    );
  },

  getImagePredictions: (split: string, category: string, filename: string) =>
    fetchJson<ImagePrediction[]>(
      `/api/results/image/${split}/${category}/${filename}`
    ),

  startRun: (modelId: string, sampleSize?: number, apiKey?: string) =>
    postJson<{ run_id: string }>("/api/benchmark/run", {
      model_id: modelId,
      sample_size: sampleSize || null,
      api_key: apiKey || null,
    }),

  getRunStatus: (runId: string) =>
    fetchJson<RunStatusResponse>(`/api/benchmark/run/${runId}/status`),

  getRunPredictions: (runId: string, last = 0) =>
    fetchJson<Prediction[]>(`/api/benchmark/run/${runId}/predictions?last=${last}`),

  getRunImageQueue: (runId: string) =>
    fetchJson<Array<{ split: string; category: string; filename: string }>>(
      `/api/benchmark/run/${runId}/queue`
    ),

  cancelRun: (runId: string) =>
    postJson<{ status: string }>(`/api/benchmark/run/${runId}/cancel`, {}),

  startBatchRun: (sampleSize?: number, apiKey?: string, modelIds?: string[]) =>
    postJson<BatchRunResponse>("/api/benchmark/batch-run", {
      sample_size: sampleSize || null,
      api_key: apiKey || null,
      model_ids: modelIds || null,
    }),

  cancelBatch: (batchId: string) =>
    postJson<{ status: string }>(`/api/benchmark/batch-run/${batchId}/cancel`, {}),

  listRuns: () => fetchJson<RunMeta[]>("/api/benchmark/runs"),

  clearHistory: () => deleteJson<{ removed: number }>("/api/benchmark/runs"),

  getBatchSummary: (runIds: string[]) =>
    fetchJson<Array<{
      run_id: string;
      model_id: string;
      model_name: string;
      metrics: import("./types").Metrics;
      ci_lower: number;
      ci_upper: number;
      category_breakdown: import("./types").CategoryBreakdown[];
      latency: import("./types").LatencyStats;
    }>>(`/api/results/batch-summary?run_ids=${runIds.join(",")}`),

  getComparison: (runIds: string[]) =>
    fetchJson<{
      model_names: Record<string, string>;
      total_images: number;
      disagreements: Array<{
        image_path: string;
        split: string;
        category: string;
        filename: string;
        predictions: Record<string, {
          parsed: string;
          correct: boolean;
          latency_ms: number;
          model_name: string;
          raw_response: string;
          reasoning: string;
        }>;
      }>;
    }>(`/api/results/compare?run_ids=${runIds.join(",")}`),

  imageUrl: (split: string, category: string, filename: string) =>
    `${API_URL}/api/dataset/images/${split}/${category}/${filename}`,

  getBattleFeed: (last = 0) =>
    fetchJson<BattleRound[]>(`/api/battle/feed?last=${last}`),

  getBattleStats: () => fetchJson<BattleStats>("/api/battle/stats"),

  battleImageUrl: (filename: string) =>
    `${API_URL}/api/battle/images/${filename}`,

  getArenaLeaderboard: () =>
    fetchJson<ArenaLeaderboard>("/api/battle/leaderboard"),

  getUserLeaderboard: () =>
    fetchJson<ArenaLeaderboard>("/api/arena/leaderboard?source=users"),

  getAgentLeaderboard: () =>
    fetchJson<ArenaLeaderboard>("/api/arena/leaderboard?source=arena"),
};
