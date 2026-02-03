"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { ModelDetail, Prediction } from "@/lib/types";

export function useModelDetail(modelId: string) {
  const [data, setData] = useState<ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getModelDetail(modelId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [modelId]);

  return { data, loading, error };
}

export function useModelPredictions(modelId: string, filter?: string) {
  const [data, setData] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getModelPredictions(modelId, filter)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [modelId, filter]);

  return { data, loading, error };
}
