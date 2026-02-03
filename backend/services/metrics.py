from __future__ import annotations

import math
import statistics

from models import CategoryBreakdown, LatencyStats, Metrics, Prediction


def wilson_ci(successes: int, total: int, z: float = 1.96) -> tuple[float, float]:
    """Wilson score 95% confidence interval for a proportion."""
    if total == 0:
        return (0.0, 0.0)
    p = successes / total
    denom = 1 + z * z / total
    centre = p + z * z / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    lower = (centre - spread) / denom
    upper = (centre + spread) / denom
    return (round(max(0.0, lower), 4), round(min(1.0, upper), 4))


def compute_enhanced_metrics(predictions: list[Prediction]) -> dict:
    """Compute full metrics: accuracy + CI, per-category breakdown, latency stats."""
    metrics = compute_metrics(predictions)

    # Confidence interval on accuracy
    correct = metrics.true_positives + metrics.true_negatives
    total_valid = metrics.total - metrics.errors
    ci_lower, ci_upper = wilson_ci(correct, total_valid)

    # Per-category breakdown
    categories: dict[str, dict] = {}
    for p in predictions:
        if p.parsed == "error":
            continue
        cat = p.category
        if cat not in categories:
            categories[cat] = {"total": 0, "correct": 0}
        categories[cat]["total"] += 1
        if p.correct:
            categories[cat]["correct"] += 1

    breakdowns = []
    for cat, counts in sorted(categories.items()):
        cat_ci = wilson_ci(counts["correct"], counts["total"])
        acc = counts["correct"] / counts["total"] if counts["total"] > 0 else 0.0
        breakdowns.append(
            CategoryBreakdown(
                category=cat,
                total=counts["total"],
                correct=counts["correct"],
                accuracy=round(acc, 4),
                ci_lower=cat_ci[0],
                ci_upper=cat_ci[1],
            )
        )

    # Latency stats (exclude errors)
    latencies = [p.latency_ms for p in predictions if p.parsed != "error"]
    if latencies:
        latencies_sorted = sorted(latencies)
        p95_idx = int(math.ceil(0.95 * len(latencies_sorted))) - 1
        latency_stats = LatencyStats(
            mean_ms=round(statistics.mean(latencies), 1),
            median_ms=round(statistics.median(latencies), 1),
            p95_ms=round(latencies_sorted[max(0, p95_idx)], 1),
        )
    else:
        latency_stats = LatencyStats(mean_ms=0.0, median_ms=0.0, p95_ms=0.0)

    return {
        "metrics": metrics,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "category_breakdown": [b.model_dump() for b in breakdowns],
        "latency": latency_stats.model_dump(),
    }


def compute_metrics(predictions: list[Prediction]) -> Metrics:
    """Compute binary classification metrics.

    Positive = hot_dog (ground truth category == 'hot_dog', model says 'yes')
    Negative = not_hot_dog (ground truth category == 'not_hot_dog', model says 'no')
    """
    tp = tn = fp = fn = errors = 0

    for p in predictions:
        if p.parsed == "error":
            errors += 1
            continue

        is_hot_dog = p.category == "hot_dog"
        predicted_hot_dog = p.parsed == "yes"

        if is_hot_dog and predicted_hot_dog:
            tp += 1
        elif not is_hot_dog and not predicted_hot_dog:
            tn += 1
        elif not is_hot_dog and predicted_hot_dog:
            fp += 1
        else:
            fn += 1

    total = tp + tn + fp + fn
    accuracy = (tp + tn) / total if total > 0 else 0.0
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall) > 0
        else 0.0
    )

    return Metrics(
        accuracy=round(accuracy, 4),
        precision=round(precision, 4),
        recall=round(recall, 4),
        f1=round(f1, 4),
        true_positives=tp,
        true_negatives=tn,
        false_positives=fp,
        false_negatives=fn,
        total=total + errors,
        errors=errors,
    )
