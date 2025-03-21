import AppsSection from '~/components/AppsSection';
import AppRegistrationForm from '~/components/AppRegistrationForm';
import { fetchApps, fetchRecentDeployments } from '~/app/actions';
import { Deployment } from '~/types';
import DeploymentLogsModal from '~/components/modals/DeploymentLogsModal';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: { modalViewLogs?: string; modalAppName?: string } }) {
  // Fetch both apps and deployments in parallel
  const [apps, deployments] = await Promise.all([
    fetchApps(),
    fetchRecentDeployments()
  ]);

  const { modalViewLogs, modalAppName } = await searchParams;

  return (
    <>
      <main className="">
        <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

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
      {modalViewLogs && (
        <DeploymentLogsModal
          appName={modalAppName || ""}
          deploymentId={Number.parseInt(modalViewLogs)}
          closeHref={`/`}
        />
      )}
    </>
  );
}
