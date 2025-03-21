import Card from "~/components/general/Card";
import { fetchApps } from "../actions"
import AppsTable from "~/components/tables/AppsTable";

const AppsPage = async () => {
  const apps = await fetchApps();

  return (
    <>
      <main className="">
        <h1 className="text-3xl font-bold mb-8">Applications</h1>

        <Card
          padding="table"
          title="Applications"
          content={
            <AppsTable
              apps={apps}
            />
          }
        />
      </main>
    </>
  );
}

export default AppsPage;
