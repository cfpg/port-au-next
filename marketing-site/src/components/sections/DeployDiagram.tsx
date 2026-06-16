"use client";

import { useCallback, useRef, useState } from "react";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./DeployDiagram.module.css";

type Slot = "blue" | "green";

export default function DeployDiagram() {
  const [active, setActive] = useState<Slot>("blue");
  const [building, setBuilding] = useState(false);
  const [target, setTarget] = useState<Slot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const deploy = useCallback(() => {
    if (building) return;
    const next: Slot = active === "blue" ? "green" : "blue";
    setBuilding(true);
    setTarget(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActive(next);
      setBuilding(false);
      setTarget(null);
    }, 1900);
  }, [active, building]);

  const slotStatus = (slot: Slot) => {
    if (building && target === slot) return { label: "Building…", dot: "#F0A53C" };
    if (active === slot) return { label: building ? "Serving" : "Live", dot: "#4FA06B" };
    return { label: "Idle", dot: "#B9AC9D" };
  };

  const blue = slotStatus("blue");
  const green = slotStatus("green");

  const phaseLabel = building
    ? `Building ${target}, traffic stays on ${active}, zero downtime`
    : `All traffic on the ${active} slot · healthy`;

  return (
    <section className={styles.section}>
      <div className="pan-container">
        <SectionHeader
          align="center"
          eyebrow="The blue/green swap"
          title="Watch a deploy happen, without a blink."
          lead="Push to main. Port-Au-Next builds the new version, health-checks it, and only then tells nginx to route traffic over. The old version serves the whole time."
          maxWidth={620}
          className={styles.header}
        />

        <div className={styles.panel}>
          <div className={styles.panelTop}>
            <div>
              <div className={styles.panelTitle}>blog-app · production</div>
              <div className={styles.panelPhase}>{phaseLabel}</div>
            </div>
            <button type="button" className={`pan-btn ${styles.deployBtn}`} onClick={deploy}>
              {building ? "Deploying…" : "Push to main → deploy"}
            </button>
          </div>

          <div className={styles.pipeline}>
            <div className={styles.pipelineStep}>git push</div>
            <span className={styles.pipelineArrow}>→</span>
            <div className={styles.pipelineStep}>build image</div>
            <span className={styles.pipelineArrow}>→</span>
            <div className={styles.pipelineStep}>health check</div>
            <span className={styles.pipelineArrow}>→</span>
            <div className={styles.pipelineRouter}>
              nginx router
              <span
                className={styles.trafficDot}
                style={{ background: active === "green" ? "#4FA06B" : "#3E7C8C" }}
              />
            </div>
          </div>

          <div className={styles.slots}>
            <SlotCard
              name="Blue slot"
              version="blog-app:v1.4.0"
              color="#3E7C8C"
              bgClass={styles.blueBg}
              borderClass={styles.blueBorder}
              textColor="#2A5663"
              badgeBg="#E4EFF1"
              badgeColor="#356575"
              isLive={active === "blue"}
              isBuilding={building && target === "blue"}
              status={blue.label}
              dot={blue.dot}
            />
            <SlotCard
              name="Green slot"
              version="blog-app:v1.5.0"
              color="#4FA06B"
              bgClass={styles.greenBg}
              borderClass={styles.greenBorder}
              textColor="#2F6B45"
              badgeBg="#E4F1E9"
              badgeColor="#357A4E"
              isLive={active === "green"}
              isBuilding={building && target === "green"}
              status={green.label}
              dot={green.dot}
            />
          </div>

          <div className={styles.footerNote}>
            <span className={styles.zeroDowntime}>
              <span className={styles.zeroDot} />
              0ms downtime
            </span>
            The old slot keeps serving until the new one passes its health check, then nginx
            swaps the route and drains the old container.
          </div>
        </div>
      </div>
    </section>
  );
}

type SlotCardProps = {
  name: string;
  version: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textColor: string;
  badgeBg: string;
  badgeColor: string;
  isLive: boolean;
  isBuilding: boolean;
  status: string;
  dot: string;
};

function SlotCard({
  name,
  version,
  color,
  bgClass,
  borderClass,
  textColor,
  badgeBg,
  badgeColor,
  isLive,
  isBuilding,
  status,
  dot,
}: SlotCardProps) {
  return (
    <div className={styles.slotWrap}>
      <div
        className={`${styles.liveRing} ${borderClass}`}
        style={{ opacity: isLive ? 1 : 0 }}
      />
      <div className={styles.buildPulse} style={{ opacity: isBuilding ? 1 : 0 }} />
      <div className={`${styles.slotInner} ${bgClass}`}>
        <div
          className={styles.flowBar}
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, ${color} 0 6px, transparent 6px 12px)`,
            opacity: isLive ? 1 : 0,
          }}
        />
        <div className={styles.slotHeader}>
          <div className={styles.slotName} style={{ color: textColor }}>
            {name}
          </div>
          <span className={styles.slotBadge} style={{ background: badgeBg, color: badgeColor }}>
            <span className={styles.slotDot} style={{ background: dot }} />
            {status}
          </span>
        </div>
        <div className={styles.slotVersion}>{version}</div>
        <div className={styles.slotBlocks}>
          <div style={{ background: color, opacity: 0.85 }} />
          <div style={{ background: color, opacity: 0.55 }} />
          <div style={{ background: color, opacity: 0.3 }} />
        </div>
      </div>
    </div>
  );
}
