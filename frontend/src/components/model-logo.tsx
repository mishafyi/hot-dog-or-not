import Image from "next/image";
import { cn } from "@/lib/utils";

const LOGOS: Record<string, string> = {
  nvidia: "/logos/NVIDIA.webp",
  google: "/logos/gemma3.png",
  allenai: "/logos/molmo_logo.png",
};

function getLogoPath(modelId: string): string | null {
  const prefix = modelId.split("/")[0]?.toLowerCase();
  return LOGOS[prefix] ?? null;
}

interface ModelLogoProps {
  modelId: string;
  size?: number;
  className?: string;
}

export function ModelLogo({ modelId, size = 18, className }: ModelLogoProps) {
  const logo = getLogoPath(modelId);
  if (!logo) return null;

  return (
    <Image
      src={logo}
      alt=""
      width={size}
      height={size}
      className={cn("object-contain shrink-0", className)}
      unoptimized
    />
  );
}
