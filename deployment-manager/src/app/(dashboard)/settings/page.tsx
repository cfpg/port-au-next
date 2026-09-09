import Panel from "~/components/general/Panel";
import PageHeader from "~/components/general/PageHeader";
import { fetchServicesHealth } from "./actions";
import SettingsAdminUser from "~/components/settings/SettingsAdminUser";
import CloudflareSettingsCard from "~/components/settings/CloudflareSettingsCard";
import { auth } from "~/lib/auth";
import { headers } from "next/headers";
import ServiceCard from "~/components/services/ServiceCard";

const SettingsPage = async () => {
  const servicesHealth = await fetchServicesHealth();
  const session = await auth.api.getSession({
    headers: await headers()
  });

  return (
    <main>
      <PageHeader title="Settings" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-14 mb-24">
        <Panel
          title="Account"
          content={<SettingsAdminUser email={session?.user.email || ''} />}
        />
      </div>

      <div className="font-mono text-micro tracking-caps-wide uppercase text-ink-faint mb-12">Services Health</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(196px,1fr))] gap-10 mb-24">
        {servicesHealth.map((service) => (
          <ServiceCard
            key={service.id}
            name={service.name}
            status={service.status}
            service={service.service}
            id={service.id}
          />
        ))}
      </div>

      <div>
        <Panel
          title="Cloudflare"
          content={<CloudflareSettingsCard />}
        />
      </div>
    </main>
  );
}

export default SettingsPage;
