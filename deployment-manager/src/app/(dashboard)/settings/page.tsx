import Card from "~/components/general/Card";
import ServicesHealthTable from "~/components/tables/ServicesHealthTable";
import { fetchServicesHealth } from "./actions";
import SettingsAdminUser from "~/components/settings/SettingsAdminUser";
import { auth } from "~/lib/auth";
import { headers } from "next/headers";

const SettingsPage = async () => {
  const servicesHealth = await fetchServicesHealth();
  const session = await auth.api.getSession({
    headers: await headers()
  });
  
  return (
    <main>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card
          title="Account"
          content={<SettingsAdminUser email={session?.user.email || ''} />}
        />
      </div>

      <Card
        padding="table"
        title="Services Health"
        content={
          <ServicesHealthTable servicesHealth={servicesHealth} />
        }
      />
    </main>
  );
}

export default SettingsPage;
