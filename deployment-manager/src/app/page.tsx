import AppsSection from '~/components/AppsSection';
import AppRegistrationSection from '~/components/AppRegistrationSection';
import fetchApps from '~/queries/fetchApps';
import fetchDeployments from '~/queries/fetchDeployments';

export default async function Home() {
  // Fetch both apps and deployments in parallel
  const [apps, deployments] = await Promise.all([
    fetchApps(),
    fetchDeployments()
  ]);

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <AppsSection
            initialApps={apps}
            initialDeployments={deployments}
          />
        </div>

        <div>
          <AppRegistrationSection />
        </div>
      </div>
    </main>
  );
}
