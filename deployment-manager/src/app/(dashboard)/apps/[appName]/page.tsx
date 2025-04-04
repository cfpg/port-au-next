import { SWRConfig } from 'swr';
import { fetchApp, fetchAppDeployments, fetchActivePreviewBranches } from './actions';
import SingleAppDashboard from '~/components/SingleAppDashboard';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ appName: string }>;
}

export default async function SingleAppPage({ params }: PageProps) {
  const { appName } = await params;
  const app = await fetchApp(appName);

  const [activePreviewBranches, deployments] = await Promise.all([
    fetchActivePreviewBranches(app.id),
    fetchAppDeployments(app.id),
  ]);

  return (
    <SWRConfig
      value={
        {
          fallback: {
            [`/api/apps/${app.id}/preview-branches`]: activePreviewBranches,
            [`/api/apps/${app.id}/deployments`]: deployments,
          },
        }
      }
    >
      <SingleAppDashboard app={app} />
    </SWRConfig>
  );
}