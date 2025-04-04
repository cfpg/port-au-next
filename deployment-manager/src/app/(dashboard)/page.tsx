import AppsSection from '~/components/AppsSection';
import AppRegistrationForm from '~/components/AppRegistrationForm';
import { fetchApps, fetchRecentDeployments } from '~/app/(dashboard)/actions';
import { SWRConfig } from 'swr';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home() {
  // Fetch both apps and deployments in parallel
  const [apps, deployments] = await Promise.all([
    fetchApps(),
    fetchRecentDeployments()
  ]);

  return (
    <SWRConfig
      value={{
        fallback: {
          '/api/apps': apps,
          '/api/apps/deployments': deployments,
        },
      }}
    >
      <main className="">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12">
            <AppsSection />
          </div>

          <div className="col-span-12" id="new">
            <AppRegistrationForm />
          </div>
        </div>
      </main>
    </SWRConfig>
  );
}
