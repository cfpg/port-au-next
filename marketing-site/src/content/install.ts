export const installPrerequisites = [
  "Docker & Docker Compose",
  "Git",
  "An SSH key for GitHub (for auto-deploys)",
  "A Cloudflare account (recommended for tunnel exposure)",
] as const;

export type InstallStep = {
  step: number;
  title: string;
  copyText: string;
  accent: string;
  accentText: string;
  lines: InstallLine[];
};

export type InstallLine =
  | { type: "comment"; text: string }
  | { type: "command"; prompt?: boolean; text: string }
  | { type: "success"; text: string }
  | { type: "env"; key: string; value: string; valueColor?: string };

export const installSteps: InstallStep[] = [
  {
    step: 1,
    title: "Clone the repo",
    copyText: "git clone https://github.com/cfpg/port-au-next.git\ncd port-au-next",
    accent: "#E2553B",
    accentText: "#fff",
    lines: [
      { type: "command", prompt: true, text: "git clone https://github.com/cfpg/port-au-next.git" },
      { type: "command", prompt: true, text: "cd port-au-next" },
    ],
  },
  {
    step: 2,
    title: "Configure your .env",
    copyText: "cp .env.example .env",
    accent: "#F0A53C",
    accentText: "#271F1A",
    lines: [
      { type: "comment", text: "# copy the example and fill in your values" },
      { type: "env", key: "DEPLOYMENT_MANAGER_HOST", value: "manager.yourdomain.dev", valueColor: "#3E7C8C" },
      { type: "env", key: "POSTGRES_USER", value: "portaunext", valueColor: "#F0A53C" },
      { type: "env", key: "POSTGRES_PASSWORD", value: "changeme123", valueColor: "#E2553B" },
      { type: "env", key: "BETTER_AUTH_SECRET", value: "changeme567", valueColor: "#E2553B" },
      { type: "env", key: "IMGPROXY_HOST", value: "cdn.yourdomain.com", valueColor: "#3E7C8C" },
      { type: "env", key: "MINIO_HOST", value: "storage.yourdomain.com", valueColor: "#3E7C8C" },
      { type: "env", key: "PORT_SCHEDULE_MASTER_API_KEY", value: "a_long_random_secret", valueColor: "#E2553B" },
      { type: "env", key: "PORT_SCHEDULE_HOST", value: "schedule.yourdomain.com", valueColor: "#3E7C8C" },
      { type: "env", key: "UMAMI_HOST", value: "analytics.yourdomain.com", valueColor: "#3E7C8C" },
      { type: "env", key: "UMAMI_APP_SECRET", value: "openssl_rand_hex_32", valueColor: "#E2553B" },
    ],
  },
  {
    step: 3,
    title: "Launch the stack",
    copyText: "docker compose up --build -d",
    accent: "#4FA06B",
    accentText: "#fff",
    lines: [
      { type: "command", prompt: true, text: "docker compose up --build -d" },
      { type: "success", text: "✓ deployment manager ready → http://localhost:80" },
    ],
  },
  {
    step: 4,
    title: "Connect Cloudflare (optional)",
    copyText: "# Settings → Cloudflare in the deployment manager UI",
    accent: "#3E7C8C",
    accentText: "#fff",
    lines: [
      { type: "comment", text: "# in the deployment manager dashboard" },
      { type: "success", text: "Settings → Cloudflare → connect API token" },
      { type: "success", text: "Select or create a tunnel → copy cloudflared install command" },
      { type: "success", text: "App Settings → Cloudflare → Sync route per app" },
      { type: "comment", text: "# you still add domains to Cloudflare + run cloudflared manually" },
    ],
  },
];
