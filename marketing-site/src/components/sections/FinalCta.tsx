import { Rocket } from "lucide-react";
import GitHubIcon from "@/components/brand/GitHubIcon";
import Logo from "@/components/brand/Logo";
import { site } from "@/content/site";
import styles from "./FinalCta.module.css";

export default function FinalCta() {
  return (
    <section className={`pan-container ${styles.section}`}>
      <div className={styles.panel}>
        <div className={styles.glow} />
        <div className={styles.content}>
          <Logo size={52} gradientId="cta-logo-sun" lineColor="#271F1A" className={styles.logo} />
          <h2 className={styles.title}>Take back your deploys.</h2>
          <p className={styles.lead}>
            Self-hosting your Next.js apps shouldn&apos;t feel scary. Clone the repo and have a
            zero-downtime platform running on your own hardware tonight.
          </p>
          <div className={styles.actions}>
            <a href="#install" className={`pan-btn ${styles.primary}`}>
              <Rocket size={18} />
              Get started
            </a>
            <a
              href={site.githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`pan-btn ${styles.secondary}`}
            >
              <GitHubIcon size={18} />
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
