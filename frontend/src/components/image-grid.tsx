"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageResultCard } from "@/components/image-result-card";
import type { Prediction } from "@/lib/types";

const PAGE_SIZE = 24;

export function ImageGrid({ predictions }: { predictions: Prediction[] }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(predictions.length / PAGE_SIZE);
  const visible = predictions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (predictions.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-8">
        No predictions to display
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {visible.map((p) => (
          <ImageResultCard key={p.image_path} prediction={p} />
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
