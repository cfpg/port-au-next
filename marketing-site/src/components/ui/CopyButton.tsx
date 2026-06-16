"use client";

import { Copy } from "lucide-react";
import { useCallback, useState } from "react";
import styles from "./CopyButton.module.css";

type CopyButtonProps = {
  text: string;
  className?: string;
};

export default function CopyButton({ text, className }: CopyButtonProps) {
  const [label, setLabel] = useState("copy");

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setLabel("copied!");
      window.setTimeout(() => setLabel("copy"), 1300);
    } catch {
      /* clipboard unavailable */
    }
  }, [text]);

  return (
    <button
      type="button"
      className={`pan-btn ${styles.button} ${className ?? ""}`}
      onClick={handleCopy}
      aria-label="Copy to clipboard"
    >
      <Copy size={13} />
      <span>{label}</span>
    </button>
  );
}
