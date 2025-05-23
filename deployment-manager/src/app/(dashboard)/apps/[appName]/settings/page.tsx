import { fetchApp } from "../actions";
import Card from "~/components/general/Card";
import EnvVarsSettings from '~/components/env-vars/EnvVarsSettings';
import PreviewBranchesCard from '~/components/settings/PreviewBranchesCard';
import ObjectStorageCard from '~/components/settings/ObjectStorageCard';
import { AppSettingsForm } from '~/components/AppSettingsForm';
import { SWRConfig } from "swr";
import fetchAppEnvVars from "~/queries/fetchAppEnvVars";

export default async function AppSettingsPage({ params }: { params: Promise<{ appName: string }> }) {
  const { appName } = await params;
  const app = await fetchApp(appName);

  if (!app) {
    return <div>App not found</div>;
  }

  const appEnvVars = await fetchAppEnvVars(app.id, false);
  const appPreviewEnvVars = await fetchAppEnvVars(app.id, true);
  
  return (
    <SWRConfig
      value={
        {
          fallback: {
            [`/api/apps/${app.id}/env-vars?isPreview=false`]: appEnvVars,
            [`/api/apps/${app.id}/env-vars?isPreview=true`]: appPreviewEnvVars,
          },
        }
      }
    >
      {/* App Settings Section */}
      <Card
        className='bg-white text-black mb-8'
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
            }}
          />
        }
      />

      {/* Environment Variables Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Environment Variables"
        padding="content"
        content={
          <EnvVarsSettings app={app} />
        }
      />

      {/* Object Storage Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Object Storage"
        padding="content"
        content={
          <ObjectStorageCard app={app} />
        }
      />

      {/* Preview Branches Section */}
      <Card
        className='bg-white text-black mb-8'
        title="Preview Branches"
        padding="content"
        content={
          <PreviewBranchesCard
            app={app}
            initialPreviewDomain={app.preview_domain}
          />
        }
      />
    </SWRConfig>
  )
}