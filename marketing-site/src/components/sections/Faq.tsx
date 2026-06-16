import { ChevronDown } from "lucide-react";
import { faqItems } from "@/content/faq";
import styles from "./Faq.module.css";

export default function Faq() {
  return (
    <section id="faq" className={styles.section}>
      <div className={`pan-container ${styles.inner}`}>
        <div className={styles.header}>
          <div className="pan-eyebrow">Questions</div>
          <h2 className="pan-section-title">Good to know before you self-host.</h2>
        </div>

        <div className={styles.list}>
          {faqItems.map((item) => (
            <details key={item.question} className={styles.item}>
              <summary className={styles.summary}>
                {item.question}
                <span className="pan-chev">
                  <ChevronDown size={20} />
                </span>
              </summary>
              <p className={styles.answer}>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
