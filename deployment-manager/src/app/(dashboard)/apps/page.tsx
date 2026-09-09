import Panel from "~/components/general/Panel";
import PageHeader from "~/components/general/PageHeader";
import { fetchApps } from "../actions"
import AppsTable from "~/components/tables/AppsTable";

const AppsPage = async () => {
  const apps = await fetchApps();

  return (
    <main>
      <PageHeader title="Applications" />

      <Panel
        flush
        title="Applications"
        content={
          <AppsTable
            apps={apps}
          />
        }
      />
    </main>
  );
}

export default AppsPage;
