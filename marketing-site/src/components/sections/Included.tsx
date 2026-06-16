import {
  CalendarClock,
  Database,
  HardDrive,
  Image,
  Network,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./Included.module.css";

const services: {
  icon: LucideIcon;
  title: string;
  text: string;
  color: string;
}[] = [
  {
    icon: Database,
    title: "PostgreSQL",
    text: "A dedicated database and user per app, with isolated credentials. Optional Prisma support with managed migrations.",
    color: "#F0A53C",
  },
  {
    icon: Zap,
    title: "Redis",
    text: "Shared cache for sessions, a Next.js cache handler, and anything else you need fast key-value storage for.",
    color: "#E2553B",
  },
  {
    icon: Image,
    title: "imgproxy",
    text: "On-the-fly image optimization and resizing, ready to plug in as a custom Next.js image loader.",
    color: "#4FA06B",
  },
  {
    icon: HardDrive,
    title: "MinIO",
    text: "S3-compatible object storage for uploads and assets, with per-app policies and credentials.",
    color: "#3E7C8C",
  },
  {
    icon: Network,
    title: "Nginx + Cloudflare",
    text: "Reverse proxy that routes every domain and preview branch, exposed safely through Cloudflare tunnels.",
    color: "#F0A53C",
  },
  {
    icon: CalendarClock,
    title: "port-schedule",
    text: "A first-party HTTP cron scheduler. Per-app jobs fire signed webhooks at your public routes on a schedule.",
    color: "#E2553B",
  },
];

export default function Included() {
  return (
    <section id="included" className={styles.section}>
      <div className="pan-container">
        <SectionHeader
          eyebrow="Shared infrastructure"
          eyebrowVariant="sun"
          title="Batteries included. Wired in automatically."
          lead="Every app gets credentials injected at deploy time, no manual config. Connect to managed services the moment your container boots."
          maxWidth={680}
          className={styles.header}
        />

        <div className={styles.grid}>
          {services.map((service) => (
            <div key={service.title} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.iconBox} style={{ color: service.color }}>
                  <service.icon size={21} />
                </div>
                <div className={styles.cardTitle}>{service.title}</div>
              </div>
              <p className={styles.cardText}>{service.text}</p>
            </div>
          ))}
        </div>

        <div className={styles.envBlock}>
          <div className={styles.envComment}># injected into every app container, automatically</div>
          <div>
            POSTGRES_USER=<span className={styles.envSun}>app_specific_user</span>
          </div>
          <div>
            POSTGRES_HOST=<span className={styles.envGreen}>postgres</span>
          </div>
          <div>
            REDIS_URL=<span className={styles.envGreen}>redis://redis:6379</span>
          </div>
          <div>
            IMGPROXY_HOST=<span className={styles.envHarbour}>cdn.yourdomain.dev</span>
          </div>
          <div>
            PORT_SCHEDULE_URL=
            <span className={styles.envHarbour}>http://port-schedule:8080</span>
          </div>
        </div>
      </div>
    </section>
  );
}
