import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  color?: "emerald" | "blue" | "orange" | "purple" | "neutral" | "pink";
}

const valueColorMap = {
  emerald: "text-emerald-500",
  blue: "text-blue-500",
  orange: "text-orange-500",
  purple: "text-purple-500",
  neutral: "text-foreground",
  pink: "text-rose-500",
};

export function ModelCard({ title, value, subtitle, color = "neutral" }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-muted-foreground">
        {title}
      </p>
      <div className={cn("text-3xl font-extrabold font-mono tabular-nums", valueColorMap[color])}>
        {value}
      </div>
      {subtitle && (
        <p className="text-xs mt-1 font-medium text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
