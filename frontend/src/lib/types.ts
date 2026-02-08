export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  params: string;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  context_length: number;
}

export interface DatasetStatus {
  downloaded: boolean;
  hot_dog_count: number;
  not_hot_dog_count: number;
  total: number;
  splits: string[];
}

export interface RunStatusResponse {
  run_id: string;
  model_id: string;
  model_name: string;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  total_images: number;
  processed: number;
  correct: number;
  errors: number;
  progress_pct: number;
}

export interface RunMeta {
  run_id: string;
  batch_id: string | null;
  model_id: string;
  model_name: string;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  sample_size: number | null;
  total_images: number;
  processed: number;
  correct: number;
  errors: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface CategoryBreakdown {
  category: string;
  total: number;
  correct: number;
  accuracy: number;
  ci_lower: number;
  ci_upper: number;
}

export interface LatencyStats {
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
}

export interface LeaderboardEntry {
  model_id: string;
  model_name: string;
  provider: string;
  params: string;
  run_id: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  total: number;
  errors: number;
  ci_lower: number;
  ci_upper: number;
  median_latency_ms: number;
}

export interface Metrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  true_positives: number;
  true_negatives: number;
  false_positives: number;
  false_negatives: number;
  total: number;
  errors: number;
}

export interface ModelDetail {
  model_id: string;
  model_name: string;
  provider: string;
  params: string;
  run_id: string;
  metrics: Metrics;
  ci_lower?: number;
  ci_upper?: number;
  category_breakdown?: CategoryBreakdown[];
  latency?: LatencyStats;
}

export interface Prediction {
  image_path: string;
  split: string;
  category: string;
  filename: string;
  raw_response: string;
  reasoning: string;
  parsed: "yes" | "no" | "error";
  correct: boolean;
  latency_ms: number;
}

export interface ImagePrediction {
  model_id: string;
  model_name: string;
  raw_response: string;
  reasoning: string;
  parsed: string;
  correct: boolean;
  latency_ms: number;
}

export interface BatchRunResponse {
  batch_id: string;
  run_ids: Record<string, string>; // model_id → run_id
}

export interface ModelPredictionSlot {
  modelId: string;
  modelName: string;
  prediction: Prediction | null;
}

export interface ImageSlot {
  split: string;
  category: string;
  filename: string;
  imageKey: string;
  models: ModelPredictionSlot[];
  allModelsComplete: boolean;
}

export interface BattleRound {
  round_id: string;
  timestamp: string;
  image_filename: string;
  nemotron_answer: string;
  nemotron_reasoning: string;
  nemotron_latency_ms: number;
  claw_answer: string;
  claw_reasoning: string;
  consensus: string;
  winner: string;
  source?: string | null;
  claw_latency_ms?: number | null;
  claw_model?: string | null;
}

export interface VoteSession {
  vote_session_id: string;
  round_id: string;
  image_url: string;
  model_a_answer: string;
  model_a_reasoning: string;
  model_b_answer: string;
  model_b_reasoning: string;
}

export interface VoteReveal {
  model_a: string;
  model_a_display: string;
  model_a_side: string;
  model_b: string;
  model_b_display: string;
  model_b_side: string;
  voted_for: string;
}

export interface ArenaModel {
  model: string;
  display: string;
  rating: number;
  ci: [number, number];
  votes: number;
}

export interface ArenaLeaderboard {
  models: ArenaModel[];
  total_votes: number;
  min_votes_needed: number;
}

export interface BattleStats {
  nemotron_wins: number;
  openclaw_wins: number;
  ties: number;
  total_rounds: number;
  nemotron_accuracy: number;
  openclaw_accuracy: number;
}
