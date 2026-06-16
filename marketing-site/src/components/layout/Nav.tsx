"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import GitHubIcon from "@/components/brand/GitHubIcon";
import Logo from "@/components/brand/Logo";
import { navLinks } from "@/content/site";
import { site } from "@/content/site";
import styles from "./Nav.module.css";

export default function Nav() {
  const gradientId = useId().replace(/:/g, "");
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  return (
    <nav className={styles.nav}>
      <div className={`pan-container ${styles.inner}`}>
        <Link href="#top" className={styles.brand} onClick={closeMenu}>
          <Logo size={30} gradientId={gradientId} />
          <span className={styles.brandName}>{site.name}</span>
        </Link>

        <div className={styles.desktopLinks}>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className={`pan-link ${styles.link}`}>
              {link.label}
            </a>
          ))}
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`pan-btn ${styles.githubBtn}`}
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>

        <button
          type="button"
          className={styles.menuToggle}
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div
        id="mobile-menu"
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className={styles.mobileBackdrop} onClick={closeMenu} />
        <div className={styles.mobilePanel}>
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={closeMenu}
            >
              {link.label}
            </a>
          ))}
          <a
            href={site.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`pan-btn ${styles.mobileGithub}`}
            onClick={closeMenu}
          >
            <GitHubIcon />
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}
