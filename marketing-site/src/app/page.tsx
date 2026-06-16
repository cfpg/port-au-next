import DashboardMock from "@/components/sections/DashboardMock";
import DeployDiagram from "@/components/sections/DeployDiagram";
import Faq from "@/components/sections/Faq";
import Features from "@/components/sections/Features";
import FinalCta from "@/components/sections/FinalCta";
import Hero from "@/components/sections/Hero";
import Homelab from "@/components/sections/Homelab";
import HowItWorks from "@/components/sections/HowItWorks";
import Included from "@/components/sections/Included";
import Install from "@/components/sections/Install";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main id="top" className={styles.main}>
      <Hero />
      <DeployDiagram />
      <Homelab />
      <Features />
      <HowItWorks />
      <Included />
      <DashboardMock />
      <Install />
      <Faq />
      <FinalCta />
    </main>
  );
}
