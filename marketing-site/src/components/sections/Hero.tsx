"use client";

import { Copy, Rocket, Server } from "lucide-react";
import { useCallback, useState } from "react";
import GitHubIcon from "@/components/brand/GitHubIcon";
import StatusBadge from "@/components/ui/StatusBadge";
import { site } from "@/content/site";
import styles from "./Hero.module.css";

const heroApps = [
  {
    initial: "b",
    name: "blog-app",
    domain: "blog.yourdomain.dev",
    status: "live" as const,
    bg: "#F6D9BE",
    color: "#C2412B",
  },
  {
    initial: "s",
    name: "shop-storefront",
    domain: "shop.yourdomain.dev",
    status: "building" as const,
    bg: "#E4EFF1",
    color: "#2A5663",
  },
  {
    initial: "d",
    name: "docs-site",
    domain: "docs.yourdomain.dev",
    status: "live" as const,
    bg: "#E4F1E9",
    color: "#357A4E",
  },
];

const stats = [
  { value: "$0/mo", label: "in recurring cloud bills", color: "#E2553B" },
  { value: "0ms", label: "downtime on every deploy", color: "#3E7C8C" },
  { value: "One box", label: "every side project, one machine", color: "#4FA06B" },
  { value: "MIT", label: "open source, yours forever", color: "#271F1A" },
];

export default function Hero() {
  const [copyLabel, setCopyLabel] = useState("copy");
  const cloneCmd = "git clone github.com/cfpg/port-au-next.git";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText("git clone https://github.com/cfpg/port-au-next.git");
      setCopyLabel("copied!");
      window.setTimeout(() => setCopyLabel("copy"), 1300);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <section className={styles.hero}>
      <div className={styles.glowRight} />
      <div className={styles.glowLeft} />

      <div className={`pan-container ${styles.grid}`}>
        <div className={styles.copy}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            v{site.version} · homelab-ready · MIT
          </div>

          <h1 className={styles.title}>
            Your homelab can ship like the&nbsp;cloud.
          </h1>

          <p className={styles.lead}>
            A no-downtime, multi-tenant Next.js deployment manager for{" "}
            <em className={styles.em}>your own hardware</em>. Blue-green deploys,
            preview branches, and managed Postgres, Redis and MinIO — with built-in Cloudflare
            tunnel automation. No cloud bill required.
          </p>

          <div className={styles.actions}>
            <a href="#install" className={`pan-btn ${styles.primaryBtn}`}>
              <Rocket size={18} />
              Get started
            </a>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`pan-btn ${styles.secondaryBtn}`}
            >
              <GitHubIcon size={18} />
              Star on GitHub
            </a>
          </div>

          <button type="button" className={`pan-btn ${styles.cloneBtn}`} onClick={handleCopy}>
            <span className={styles.clonePrompt}>$</span>
            {cloneCmd}
            <span className={styles.cloneAction}>
              <Copy size={14} />
              <span>{copyLabel}</span>
            </span>
          </button>
        </div>

        <div className={styles.mockWrap}>
          <div className={styles.mockCard}>
            <div className={styles.mockChrome}>
              <span className={styles.dotRed} />
              <span className={styles.dotSun} />
              <span className={styles.dotGreen} />
              <div className={styles.mockUrl}>manager.yourdomain.dev</div>
            </div>
            <div className={styles.mockBody}>
              <div className={styles.mockHeader}>
                <div className={styles.mockTitle}>Applications</div>
                <span className={styles.mockCount}>3 running</span>
              </div>
              <div className={styles.appList}>
                {heroApps.map((app) => (
                  <div key={app.name} className={styles.appRow}>
                    <div className={styles.appMeta}>
                      <div
                        className={styles.appIcon}
                        style={{ background: app.bg, color: app.color }}
                      >
                        {app.initial}
                      </div>
                      <div>
                        <div className={styles.appName}>{app.name}</div>
                        <div className={styles.appDomain}>{app.domain}</div>
                      </div>
                    </div>
                    <StatusBadge
                      label={app.status}
                      variant={app.status === "building" ? "building" : "live"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.floatDeploy}>
            <span className={styles.floatDot} />
            deploy #1284 · 0ms downtime
          </div>
          <div className={styles.floatHardware}>
            <Server size={13} className={styles.floatHardwareIcon} />
            i5-6500 · 16GB · home network
          </div>
        </div>
      </div>

      <div className={`pan-container ${styles.stats}`}>
        {stats.map((stat) => (
          <div key={stat.label} className={`pan-card ${styles.statCard}`}>
            <div className={styles.statValue} style={{ color: stat.color }}>
              {stat.value}
            </div>
            <div className={styles.statLabel}>{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
