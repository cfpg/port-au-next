import {
  ArrowLeftRight,
  GitPullRequestArrow,
  HeartPulse,
  Package,
  RefreshCw,
  Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./HowItWorks.module.css";

const steps: {
  num: string;
  title: string;
  text: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    num: "01",
    title: "Preparation",
    text: "Triggered by the UI or a GitHub webhook.",
    icon: GitPullRequestArrow,
    color: "#2A5663",
  },
  {
    num: "02",
    title: "Building",
    text: "Latest code built into a new Docker image.",
    icon: Package,
    color: "#B07A1E",
  },
  {
    num: "03",
    title: "Launching",
    text: "New container starts, assigned a version.",
    icon: Rocket,
    color: "#357A4E",
  },
  {
    num: "04",
    title: "Health check",
    text: "Verified healthy before any traffic moves.",
    icon: HeartPulse,
    color: "#E2553B",
  },
  {
    num: "05",
    title: "Switching",
    text: "Nginx routes traffic to the new container.",
    icon: ArrowLeftRight,
    color: "#2A5663",
  },
  {
    num: "06",
    title: "Cleanup",
    text: "Previous container gracefully terminated.",
    icon: RefreshCw,
    color: "#357A4E",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className={`pan-container ${styles.section}`}>
      <SectionHeader
        eyebrow="The deployment workflow"
        title="Six steps, fully automated."
        lead="From a git push to live traffic, Port-Au-Next runs the whole pipeline so you never babysit a deploy on the closet box."
        maxWidth={640}
        className={styles.header}
      />

      <div className={styles.steps}>
        <div className={styles.connector} />
        {steps.map((step) => (
          <div key={step.num} className={styles.step}>
            <div className={styles.iconWrap} style={{ color: step.color }}>
              <step.icon size={22} />
            </div>
            <div className={styles.num}>{step.num}</div>
            <div className={styles.title}>{step.title}</div>
            <p className={styles.text}>{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
