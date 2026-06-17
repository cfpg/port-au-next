export type FaqItem = {
  question: string;
  answer: string;
};

export const faqItems: FaqItem[] = [
  {
    question: "Do I need a cloud account or any paid service?",
    answer:
      "No. Port-Au-Next runs entirely on infrastructure you own — a VPS, a cloud box, or hardware at home. Cloudflare tunnels are optional but recommended to expose apps safely without opening ports. It's MIT licensed and free forever.",
  },
  {
    question: "Will it run on a Raspberry Pi or an old laptop?",
    answer:
      "If it runs Docker and Docker Compose, it runs Port-Au-Next. A spare laptop, a mini-PC, an old desktop, even a Raspberry Pi for lighter workloads. More apps and heavier builds simply want more RAM, so a machine with 8GB or more is a comfortable starting point.",
  },
  {
    question: "Do I need to open ports or have a static IP?",
    answer:
      "No. Cloudflare tunnels open an outbound connection from your machine, so your apps are reachable without port forwarding, a static IP, or exposing your home network. It works fine behind CGNAT, which is exactly the situation most home connections are in.",
  },
  {
    question: "Is it okay to leave running 24/7?",
    answer:
      "That's the idea. A closet machine sips power compared to a recurring cloud invoice, and blue-green deploys mean you can update apps any time without taking anything down. When you outgrow the box, point the same setup at a VPS or a rack and keep every workflow.",
  },
  {
    question: "How does the zero-downtime deploy actually work?",
    answer:
      "It's a true blue/green strategy. A new container is built and started alongside the running one. Only after it passes a health check does nginx switch traffic over, then the old container is gracefully drained. If the new version is unhealthy, traffic never moves.",
  },
  {
    question: "Can I run more than one app on a single server?",
    answer:
      "Yes — that's the whole point. Port-Au-Next is multi-tenant. Each app runs in its own isolated container with its own database, credentials, and environment variables, and you map domains and subdomains to each one independently.",
  },
  {
    question: "What are preview branches?",
    answer:
      "Deploy any feature branch to its own subdomain (e.g. feature-x.preview.yourdomain.dev) with an isolated database and branch-specific env vars. Point previews at dev services, test in a production-like environment, then clean them up automatically when the branch merges.",
  },
  {
    question: "Does it auto-deploy from GitHub?",
    answer:
      "Yes. Push to a configured branch and Port-Au-Next deploys it via GitHub Actions integration. You can also trigger deployments programmatically through the REST API, or kick them off manually from the dashboard.",
  },
  {
    question: "What is port-schedule?",
    answer:
      "A first-party HTTP scheduler. Instead of a crontab inside your container, each app registers cron-like jobs via an API, and port-schedule fires signed webhook requests to your app's public routes on schedule. Perfect for nightly syncs, cleanups, and recurring tasks in a stateless deploy model.",
  },
  {
    question: "What is Umami analytics?",
    answer:
      "A shared, privacy-focused analytics instance. Opt in per app from the dashboard to get an isolated website, tracking env vars on production deploy, and your own Umami login. You add the Next.js snippet yourself; cookie and consent banners stay your responsibility.",
  },
];
