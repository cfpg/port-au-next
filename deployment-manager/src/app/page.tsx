import AppsSection from '~/components/AppsSection';
import AppRegistrationForm from '~/components/AppRegistrationForm';
import { fetchApps, fetchRecentDeployments } from '~/app/actions';
import { Deployment, App } from '~/types';

export default async function Home() {
  // Fetch both apps and deployments in parallel
  const [apps, deployments] = await Promise.all([
    fetchApps(),
    fetchRecentDeployments()
  ]);

  return (
    <main className="">
      <h1 className="text-3xl font-bold mb-8">Port-au-Next Dashboard</h1>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12">
          <AppsSection
            initialApps={apps}
            initialDeployments={deployments as Deployment[]}
          />
        </div>

        <div className="col-span-12" id="new">
          <AppRegistrationForm />
        </div>
      </div>
    </main>
  );
}
