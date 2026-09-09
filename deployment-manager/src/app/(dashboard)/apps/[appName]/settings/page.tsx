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
    <>
      <AppSettingsForm
        className="mb-8"
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

      <Panel
        className="bg-white text-black mb-8"
        title="Cloudflare"
        content={<CloudflareAppCard app={app} />}
      />

      <Panel
        className="bg-white text-black mb-8"
        title="Object Storage"
        content={<ObjectStorageCard app={app} />}
      />

      <Panel
        className="bg-white text-black mb-8"
        title="Analytics"
        content={<AnalyticsCard app={app} />}
      />

      <Panel
        className="bg-white text-black mb-8"
        title="Error tracking"
        content={<ErrorTrackingCard app={app} />}
      />

      <Panel
        className="bg-white text-black mb-8"
        title="Database"
        content={<PrismaCard app={app} />}
      />

      <Panel
        className="bg-white text-black mb-8"
        title="Preview Branches"
        content={
          <PreviewBranchesCard app={app} initialPreviewDomain={app.preview_domain} />
        }
      />
    </>
  );
}
