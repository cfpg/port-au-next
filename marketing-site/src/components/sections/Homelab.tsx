import { Cloud, Cpu, Leaf, TrendingUp } from "lucide-react";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./Homelab.module.css";

const cards = [
  {
    icon: Cloud,
    title: "No ports. No static IP.",
    text: "Cloudflare tunnels reach your apps through an outbound connection — no exposed home network. Connect your account in the dashboard to automate routes and DNS; you still run cloudflared on the box.",
    bg: "#E4EFF1",
    color: "#2A5663",
  },
  {
    icon: Cpu,
    title: "A second career for old hardware.",
    text: "That 2016 desktop, a mini-PC, a spare laptop, a NUC. If it runs Docker, it can run your whole fleet. Give the hardware you already own something useful to do.",
    bg: "#FBEDE7",
    color: "#E2553B",
  },
  {
    icon: Leaf,
    title: "Sips power, not budget.",
    text: "A few watts in the closet instead of an invoice that renews every month whether you ship or not. Your projects, your electricity, your rules.",
    bg: "#E4F1E9",
    color: "#357A4E",
  },
];

export default function Homelab() {
  return (
    <section className={`pan-container ${styles.section}`}>
      <SectionHeader
        eyebrow="Built for the homelab"
        title="Runs on whatever you've got."
        lead="No datacenter, no static IP, no credit card on file. You need a machine that runs Docker and a Cloudflare account. The closet PC is the whole point."
        maxWidth={660}
        className={styles.header}
      />

      <div className={styles.grid3}>
        {cards.map((card) => (
          <div key={card.title} className={`pan-card ${styles.card}`}>
            <div className={styles.iconBox} style={{ background: card.bg, color: card.color }}>
              <card.icon size={23} />
            </div>
            <div className={styles.cardTitle}>{card.title}</div>
            <p className={styles.cardText}>{card.text}</p>
          </div>
        ))}
      </div>

      <div className={styles.compare}>
        <div className={styles.compareCloud}>
          <div className={styles.compareLabel}>Renting the cloud</div>
          <div className={styles.compareValueMuted}>$20 to $100+ / mo</div>
          <p className={styles.compareTextMuted}>
            per app, every month, forever. Plus bandwidth, plus build minutes, plus the next
            price hike.
          </p>
        </div>
        <div className={styles.compareOwn}>
          <div className={styles.compareLabelOwn}>Owning the box</div>
          <div className={styles.compareValueOwn}>Hardware you already own</div>
          <p className={styles.compareTextOwn}>
            plus a few watts. The tenth app costs exactly what the ninth did: nothing.
          </p>
        </div>
      </div>

      <div className={styles.growth}>
        <div className={styles.growthIcon}>
          <TrendingUp size={22} />
        </div>
        <div>
          <div className={styles.growthTitle}>Outgrow the closet? Nothing to relearn.</div>
          <p className={styles.growthText}>
            The same platform points at a VPS, a dedicated server, or a rack the day you need
            more. Start on the closet PC, move when it matters, keep every workflow.
          </p>
        </div>
      </div>
    </section>
  );
}
