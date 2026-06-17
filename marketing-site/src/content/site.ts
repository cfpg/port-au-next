export const site = {
  name: "Port-Au-Next",
  version: "0.5.0",
  githubUrl: "https://github.com/cfpg/port-au-next",
  creator: "cfpg",
  creatorUrl: "https://cfpg.me/",
  accent: "#E2553B",
  tagline:
    "A no-downtime, multi-tenant Next.js deployment manager for your own hardware.",
  description:
    "Blue-green deploys, preview branches, managed Postgres, Redis and MinIO, and built-in Cloudflare tunnel automation. No cloud bill required.",
} as const;

export const navLinks = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#included", label: "Included" },
  { href: "#install", label: "Install" },
  { href: "#faq", label: "FAQ" },
] as const;
