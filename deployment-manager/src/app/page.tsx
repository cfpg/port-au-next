import DashboardLayout from '~/components/layouts/DashboardLayout';
import AppsSection from '~/components/AppsSection';
import AppRegistrationSection from '~/components/AppRegistrationSection';
import fetchApps from '~/queries/fetchApps';

interface Deployment {
  version: string;
  commit_id: string;
  status: 'success' | 'failed' | 'in_progress';
  active_container: string;
  deployed_at: string;
}

export default async function Home() {
  const apps = await fetchApps();
  const deployments: Deployment[] = []; // TODO: Implement fetchDeployments query

  return (
    <DashboardLayout>
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
    </DashboardLayout>
  );
}
