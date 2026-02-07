"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/run", label: "Run Benchmark" },
  { href: "/results", label: "Results" },
  { href: "/gallery", label: "Gallery" },
  { href: "/battle", label: "Battle" },
  { href: "/about", label: "About" },
];

export function NavHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center gap-6 px-4">
        <Link href="/" className="font-bold text-lg whitespace-nowrap">
          Hot Dog or Not
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                pathname === link.href || pathname.startsWith(link.href + "/")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
