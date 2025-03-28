import Card from "~/components/general/Card";
import ServicesHealthTable from "~/components/tables/ServicesHealthTable";
import { fetchServicesHealth } from "./actions";
const SettingsPage = async () => {
  const servicesHealth = await fetchServicesHealth();
  return (
    <>
      <main>
        <h1 className="text-3xl font-bold mb-8">Settings</h1>
        
        <Card
          padding="table"
          title="Services Health"
          content={
            <ServicesHealthTable servicesHealth={servicesHealth} />
          }
        />
      </main>
    </>
  );
}

export default SettingsPage;
