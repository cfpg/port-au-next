import { fetchApp } from '../actions';
import Panel from '~/components/general/Panel';
import PreviewBranchesCard from '~/components/settings/PreviewBranchesCard';
import PrismaCard from '~/components/settings/PrismaCard';
import ObjectStorageCard from '~/components/settings/ObjectStorageCard';
import AnalyticsCard from '~/components/settings/AnalyticsCard';
import ErrorTrackingCard from '~/components/settings/ErrorTrackingCard';
import CloudflareAppCard from '~/components/settings/CloudflareAppCard';
import { AppSettingsForm } from '~/components/AppSettingsForm';

export default async function AppSettingsPage({
  params,
}: {
  params: Promise<{ appName: string }>;
}) {
  const { appName } = await params;
  const app = await fetchApp(appName);

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <div className="flex flex-col gap-24">
      <AppSettingsForm
        appId={app.id}
        initialSettings={{
          name: app.name,
          domain: app.domain,
          repo_url: app.repo_url,
          branch: app.branch,
          cloudflare_zone_id: app.cloudflare_zone_id,
          root_path: app.root_path,
        }}
      />

      <Panel title="Cloudflare" content={<CloudflareAppCard app={app} />} />
      <Panel title="Object Storage" content={<ObjectStorageCard app={app} />} />
      <Panel title="Analytics" content={<AnalyticsCard app={app} />} />
      <Panel title="Error tracking" content={<ErrorTrackingCard app={app} />} />
      <Panel title="Database" content={<PrismaCard app={app} />} />
      <Panel
        title="Preview Branches"
        content={<PreviewBranchesCard app={app} initialPreviewDomain={app.preview_domain} />}
      />
    </div>
  );
}
