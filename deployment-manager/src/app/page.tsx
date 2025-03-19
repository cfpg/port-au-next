import AppsSection from '~/components/AppsSection';
import AppRegistrationSection from '~/components/AppRegistrationSection';
import fetchApps from '~/queries/fetchApps';
import fetchRecentDeployments from '~/queries/fetchRecentDeployments';

export default async function Home() {
  // Fetch both apps and deployments in parallel
  const [apps, deployments] = await Promise.all([
    fetchApps(),
    fetchRecentDeployments()
  ]);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12">
          <AppsSection
            initialApps={apps}
            initialDeployments={deployments}
          />
        </div>

        <div className="col-span-12">
          <AppRegistrationSection />
        </div>
      </div>
    </main>
  );
}
