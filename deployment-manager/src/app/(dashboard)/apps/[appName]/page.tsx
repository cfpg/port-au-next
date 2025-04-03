import Card from '~/components/general/Card';
import DeploymentHistoryTable from '~/components/tables/DeploymentHistoryTable';
import { fetchApp, fetchAppDeployments } from './actions';
import ActivePreviewBranches from '~/components/settings/ActivePreviewBranches';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ appName: string }>;
}

export default async function SingleAppPage({ params }: PageProps) {
  const { appName } = await params;
  const app = await fetchApp(appName);
  const deployments = await fetchAppDeployments(app.id);

  return (
    <div>
      {/* Active Preview Branches Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Active Preview Branches"
        padding="table"
        content={<ActivePreviewBranches app={app} />}
      />

      {/* Deployment History Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Deployment History"
        padding="table"
        content={
          <DeploymentHistoryTable deployments={deployments} />
        }
      />
    </div>
  );
}