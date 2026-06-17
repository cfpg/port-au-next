import { fetchApp } from '../actions';
import Card from '~/components/general/Card';
import PreviewBranchesCard from '~/components/settings/PreviewBranchesCard';
import PrismaCard from '~/components/settings/PrismaCard';
import ObjectStorageCard from '~/components/settings/ObjectStorageCard';
import AnalyticsCard from '~/components/settings/AnalyticsCard';
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
      <Card
        className="bg-white text-black mb-8"
        title="App Settings"
        padding="content"
        content={
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
        }
      />

      <Card
        className="bg-white text-black mb-8"
        title="Cloudflare"
        padding="content"
        content={<CloudflareAppCard app={app} />}
      />

      <Card
        className="bg-white text-black mb-8"
        title="Object Storage"
        padding="content"
        content={<ObjectStorageCard app={app} />}
      />

      <Card
        className="bg-white text-black mb-8"
        title="Analytics"
        padding="content"
        content={<AnalyticsCard app={app} />}
      />

      <Card
        className="bg-white text-black mb-8"
        title="Database"
        padding="content"
        content={<PrismaCard app={app} />}
      />

      <Card
        className="bg-white text-black mb-8"
        title="Preview Branches"
        padding="content"
        content={
          <PreviewBranchesCard app={app} initialPreviewDomain={app.preview_domain} />
        }
      />
    </>
  );
}
