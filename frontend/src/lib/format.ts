export function fmtLatency(ms: number) {
  return ms < 1000 ? `${ms.toFixed(0)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function encodeModelSlug(modelId: string): string {
  return modelId.replaceAll("/", "--").replaceAll(":", "__");
}

export function decodeModelSlug(slug: string): string {
  return slug.replaceAll("--", "/").replaceAll("__", ":");
}
