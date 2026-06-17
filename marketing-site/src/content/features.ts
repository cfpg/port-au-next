import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  CalendarClock,
  GitBranch,
  Globe,
  HeartPulse,
  Repeat2,
  ShieldCheck,
  SlidersHorizontal,
  Workflow,
} from "lucide-react";

export type FeatureItem = {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
};

export const features: FeatureItem[] = [
  {
    icon: Repeat2,
    title: "Blue/Green deployments",
    description:
      "Every push spins up a fresh container. Traffic only switches once it's verified healthy. True zero downtime, even on a closet PC.",
    iconBg: "#FBEDE7",
    iconColor: "#E2553B",
  },
  {
    icon: Boxes,
    title: "Multi-tenancy",
    description:
      "Every side project on one box. Host as many Next.js apps as your hardware can handle, each isolated with its own database and env.",
    iconBg: "#E4F1E9",
    iconColor: "#357A4E",
  },
  {
    icon: GitBranch,
    title: "Preview branches",
    description:
      "Ship any feature branch to its own subdomain with an isolated database and per-branch environment variables.",
    iconBg: "#E4EFF1",
    iconColor: "#2A5663",
  },
  {
    icon: Globe,
    title: "Domain & Cloudflare tunnels",
    description:
      "Connect your Cloudflare account in the dashboard, pick a tunnel, and Port-Au-Next creates published application routes and proxied DNS when you assign domains — no port forwarding.",
    iconBg: "#FCEFD9",
    iconColor: "#B07A1E",
  },
  {
    icon: Workflow,
    title: "GitHub Actions integration",
    description:
      "Push to a configured branch and it deploys automatically. Or trigger a deploy via the REST API from anywhere.",
    iconBg: "#FBEDE7",
    iconColor: "#E2553B",
  },
  {
    icon: HeartPulse,
    title: "Health checks & rollback",
    description:
      "Switches only happen when the new container is verified. Failed deploys roll traffic back to the last good version.",
    iconBg: "#E4F1E9",
    iconColor: "#357A4E",
  },
  {
    icon: SlidersHorizontal,
    title: "Environment isolation",
    description:
      "Set env vars per app, per branch, or per preview. Run dev, staging and prod from one Port-Au-Next instance.",
    iconBg: "#E4EFF1",
    iconColor: "#2A5663",
  },
  {
    icon: CalendarClock,
    title: "HTTP scheduling",
    description:
      "port-schedule gives every app cron-like jobs that call your public routes. No crontab inside containers.",
    iconBg: "#FCEFD9",
    iconColor: "#B07A1E",
  },
  {
    icon: ShieldCheck,
    title: "Secure by default",
    description:
      "Authenticated admin UI, isolated Docker network, read-only SSH keys, and restricted Docker socket access.",
    iconBg: "#FBEDE7",
    iconColor: "#E2553B",
  },
];
