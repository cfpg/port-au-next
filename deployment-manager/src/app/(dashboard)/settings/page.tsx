import Card from "~/components/general/Card";
import { fetchServicesHealth } from "./actions";
import SettingsAdminUser from "~/components/settings/SettingsAdminUser";
import { auth } from "~/lib/auth";
import { headers } from "next/headers";
import CardGrid from "~/components/general/CardGrid";
import ServiceCard from "~/components/services/ServiceCard";

const SettingsPage = async () => {
  const servicesHealth = await fetchServicesHealth();
  const session = await auth.api.getSession({
    headers: await headers()
  });
  
  const serviceCards = servicesHealth.map(service => (
    <ServiceCard
      key={service.id}
      name={service.name}
      status={service.status}
      service={service.service}
      id={service.id}
    />
  ));
  
  return (
    <main>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card
          title="Account"
          content={<SettingsAdminUser email={session?.user.email || ''} />}
        />
      </div>

      <CardGrid
        title="Services Health"
        cards={serviceCards}
      />
    </main>
  );
}

export default SettingsPage;
