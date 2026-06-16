import styles from "./SectionHeader.module.css";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
  eyebrowVariant?: "accent" | "sun";
  className?: string;
  maxWidth?: number;
};

export default function SectionHeader({
  eyebrow,
  title,
  lead,
  align = "left",
  eyebrowVariant = "accent",
  className,
  maxWidth,
}: SectionHeaderProps) {
  return (
    <div
      className={`${styles.header} ${align === "center" ? styles.center : ""} ${className ?? ""}`}
      style={maxWidth ? { maxWidth } : undefined}
    >
      <div className={`pan-eyebrow ${eyebrowVariant === "sun" ? "pan-eyebrow--sun" : ""}`}>
        {eyebrow}
      </div>
      <h2 className="pan-section-title">{title}</h2>
      {lead ? <p className="pan-section-lead">{lead}</p> : null}
    </div>
  );
}
