import styles from "./StatusBadge.module.css";

type StatusBadgeProps = {
  label: string;
  variant: "live" | "building" | "preview" | "idle";
  size?: "sm" | "md";
};

const dotColors = {
  live: "#4FA06B",
  building: "#F0A53C",
  preview: "#3E7C8C",
  idle: "#B9AC9D",
};

export default function StatusBadge({ label, variant, size = "md" }: StatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[variant]} ${styles[size]}`}>
      <span className={styles.dot} style={{ background: dotColors[variant] }} />
      {label}
    </span>
  );
}
