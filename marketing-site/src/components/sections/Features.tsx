import { features } from "@/content/features";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./Features.module.css";

export default function Features() {
  return (
    <section id="features" className={`pan-container ${styles.section}`}>
      <SectionHeader
        eyebrow="Everything in the box"
        title="A real deployment platform, on your own metal."
        lead="The DX you'd expect from a managed cloud, without the vendor lock-in, the surprise bills, or handing over your data."
        maxWidth={640}
        className={styles.header}
      />

      <div className={styles.grid}>
        {features.map((feature) => (
          <div key={feature.title} className={`pan-card ${styles.card}`}>
            <div
              className={styles.iconBox}
              style={{ background: feature.iconBg, color: feature.iconColor }}
            >
              <feature.icon size={22} />
            </div>
            <div className={styles.title}>{feature.title}</div>
            <p className={styles.text}>{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
