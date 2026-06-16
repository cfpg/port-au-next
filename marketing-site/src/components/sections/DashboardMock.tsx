import {
  GitBranch,
  LayoutDashboard,
  Plus,
  Rocket,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Logo from "@/components/brand/Logo";
import StatusBadge from "@/components/ui/StatusBadge";
import SectionHeader from "@/components/ui/SectionHeader";
import styles from "./DashboardMock.module.css";

const rows = [
  {
    app: "blog-app",
    branch: "main",
    version: "v1.5.0",
    slot: "green",
    slotColor: "#357A4E",
    status: "live" as const,
  },
  {
    app: "shop-storefront",
    branch: "main",
    version: "v2.1.3",
    slot: "building",
    slotColor: "#B07A1E",
    status: "building" as const,
  },
  {
    app: "shop-storefront",
    branch: "feat/checkout",
    version: "preview",
    slot: "preview",
    slotColor: "#2A5663",
    status: "preview" as const,
  },
  {
    app: "docs-site",
    branch: "main",
    version: "v0.9.1",
    slot: "green",
    slotColor: "#357A4E",
    status: "live" as const,
  },
];

const navItems = [
  { icon: LayoutDashboard, label: "Applications", active: true },
  { icon: Rocket, label: "Deployments" },
  { icon: GitBranch, label: "Preview branches" },
  { icon: SlidersHorizontal, label: "Environment" },
  { icon: Users, label: "Users" },
];

export default function DashboardMock() {
  return (
    <section className={`pan-container ${styles.section}`}>
      <SectionHeader
        align="center"
        eyebrow="The management UI"
        title="One dashboard for the whole fleet."
        lead="Add apps, watch deployments roll out, tail logs, and manage env vars, all from an authenticated web console."
        maxWidth={640}
        className={styles.header}
      />

      <div className={styles.mock}>
        <div className={styles.chrome}>
          <span className={styles.dotRed} />
          <span className={styles.dotSun} />
          <span className={styles.dotGreen} />
          <div className={styles.url}>manager.yourdomain.dev/deployments</div>
        </div>

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarBrand}>
              <Logo size={22} gradientId="dash-logo-sun" lineColor="#FCF8F1" />
              <span>Port-Au-Next</span>
            </div>
            {navItems.map((item) => (
              <div
                key={item.label}
                className={item.active ? styles.navActive : styles.navItem}
              >
                <item.icon size={16} />
                {item.label}
              </div>
            ))}
          </aside>

          <div className={styles.main}>
            <div className={styles.mainHeader}>
              <div className={styles.mainTitle}>Recent deployments</div>
              <div className={styles.newApp}>
                <Plus size={15} />
                New app
              </div>
            </div>

            <div className={styles.table}>
              <div className={styles.tableHead}>
                <span>App</span>
                <span>Branch</span>
                <span>Version</span>
                <span>Slot</span>
                <span>Status</span>
              </div>
              {rows.map((row, i) => (
                <div key={`${row.app}-${row.branch}-${i}`} className={styles.tableRow}>
                  <span className={styles.appName}>{row.app}</span>
                  <span className={styles.mono}>{row.branch}</span>
                  <span className={styles.mono}>{row.version}</span>
                  <span className={styles.mono} style={{ color: row.slotColor }}>
                    {row.slot}
                  </span>
                  <span>
                    <StatusBadge label={row.status} variant={row.status} size="sm" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
