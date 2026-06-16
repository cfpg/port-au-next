import { CircleCheck } from "lucide-react";
import CopyButton from "@/components/ui/CopyButton";
import SectionHeader from "@/components/ui/SectionHeader";
import { installPrerequisites, installSteps, type InstallLine } from "@/content/install";
import styles from "./Install.module.css";

function renderLine(line: InstallLine, index: number) {
  switch (line.type) {
    case "comment":
      return (
        <div key={index} className={styles.comment}>
          {line.text}
        </div>
      );
    case "command":
      return (
        <div key={index}>
          {line.prompt ? <span className={styles.prompt}>$ </span> : null}
          <span className={styles.command}>{line.text}</span>
        </div>
      );
    case "success":
      return (
        <div key={index} className={styles.success}>
          {line.text}
        </div>
      );
    case "env":
      return (
        <div key={index}>
          {line.key}=<span style={{ color: line.valueColor }}>{line.value}</span>
        </div>
      );
  }
}

export default function Install() {
  return (
    <section id="install" className={`pan-container ${styles.section}`}>
      <div className={styles.grid}>
        <div className={styles.sticky}>
          <SectionHeader
            eyebrow="Quick start"
            title="Running in three commands."
            lead="Point it at a VPS, a cloud box, or that old PC humming in your closet. If it runs Docker, it runs Port-Au-Next."
            className={styles.header}
          />
          <div className={styles.prereqs}>
            {installPrerequisites.map((item) => (
              <div key={item} className={styles.prereq}>
                <CircleCheck size={19} className={styles.check} />
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.steps}>
          {installSteps.map((step) => (
            <div key={step.step} className={styles.stepCard}>
              <div className={styles.stepHeader}>
                <div className={styles.stepTitleWrap}>
                  <span
                    className={styles.stepNum}
                    style={{ background: step.accent, color: step.accentText }}
                  >
                    {step.step}
                  </span>
                  <span className={styles.stepTitle}>
                    {step.step === 2 ? (
                      <>
                        Configure your <span className={styles.envFile}>.env</span>
                      </>
                    ) : (
                      step.title
                    )}
                  </span>
                </div>
                <CopyButton text={step.copyText} />
              </div>
              <div className={styles.stepBody}>{step.lines.map(renderLine)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
