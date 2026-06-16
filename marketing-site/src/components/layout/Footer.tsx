import Logo from "@/components/brand/Logo";
import { navLinks, site } from "@/content/site";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={`pan-container ${styles.grid}`}>
        <div>
          <div className={styles.brand}>
            <Logo size={28} gradientId="footer-logo-sun" />
            <span className={styles.brandName}>{site.name}</span>
          </div>
          <p className={styles.tagline}>
            A no-downtime, multi-tenant Next.js deployment manager using Docker
            orchestration. Built for people who&apos;d rather own their infrastructure.
          </p>
          <div className={styles.creator}>
            Created by{" "}
            <a
              href={site.creatorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pan-link"
            >
              {site.creator}
            </a>
          </div>
        </div>

        <div>
          <div className={styles.colTitle}>Product</div>
          <div className={styles.colLinks}>
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="pan-link">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.colTitle}>Project</div>
          <div className={styles.colLinks}>
            <a href={site.githubUrl} target="_blank" rel="noopener noreferrer" className="pan-link">
              GitHub repository
            </a>
            <a href={`${site.githubUrl}/releases`} target="_blank" rel="noopener noreferrer" className="pan-link">
              Releases
            </a>
            <a href={`${site.githubUrl}/blob/dev/README.md`} target="_blank" rel="noopener noreferrer" className="pan-link">
              Documentation
            </a>
            <a href={`${site.githubUrl}/blob/dev/LICENSE`} target="_blank" rel="noopener noreferrer" className="pan-link">
              MIT License
            </a>
          </div>
        </div>
      </div>

      <div className={styles.bar}>
        <div className={`pan-container ${styles.barInner}`}>
          <span>© 2026 Port-Au-Next · Distributed under the MIT License</span>
          <span>Deploy Next.js applications on your terms.</span>
        </div>
      </div>
    </footer>
  );
}
