import type { Metrics } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ConfusionMatrix({ metrics }: { metrics: Metrics }) {
  const { true_positives, true_negatives, false_positives, false_negatives } =
    metrics;
  const total = true_positives + true_negatives + false_positives + false_negatives;

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 shadow-sm">
      <p className="text-sm font-semibold uppercase tracking-wider mb-4 text-muted-foreground">
        Confusion Matrix
      </p>
      <div className="grid grid-cols-3 gap-1.5 max-w-sm">
        {/* Header */}
        <div />
        <div className="text-center text-xs font-semibold text-muted-foreground p-2">
          Pred: Hot Dog
        </div>
        <div className="text-center text-xs font-semibold text-muted-foreground p-2">
          Pred: Not Hot Dog
        </div>

        {/* Row 1 */}
        <div className="text-xs font-semibold text-muted-foreground p-2 flex items-center">
          Actual: Hot Dog
        </div>
        <Cell value={true_positives} total={total} correct label="True Pos" />
        <Cell value={false_negatives} total={total} correct={false} label="False Neg" />

        {/* Row 2 */}
        <div className="text-xs font-semibold text-muted-foreground p-2 flex items-center">
          Actual: Not Hot Dog
        </div>
        <Cell value={false_positives} total={total} correct={false} label="False Pos" />
        <Cell value={true_negatives} total={total} correct label="True Neg" />
      </div>
      {metrics.errors > 0 && (
        <p className="text-sm text-muted-foreground mt-3 font-medium">
          {metrics.errors} prediction(s) could not be parsed
        </p>
      )}
    </div>
  );
}

function Cell({
  value,
  total,
  correct,
  label,
}: {
  value: number;
  total: number;
  correct: boolean;
  label: string;
}) {
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
  return (
    <div
      className={cn(
        "rounded-lg p-3 text-center",
        correct ? "bg-emerald-500/10" : "bg-rose-500/10"
      )}
    >
      <div className={cn(
        "text-2xl font-extrabold font-mono tabular-nums",
        correct ? "text-emerald-500" : "text-rose-500"
      )}>
        {value}
      </div>
      <div className={cn(
        "text-xs font-medium",
        correct ? "text-emerald-500/60" : "text-rose-500/60"
      )}>
        {pct}%
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}
