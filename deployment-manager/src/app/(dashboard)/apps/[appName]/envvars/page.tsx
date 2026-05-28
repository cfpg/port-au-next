import { fetchApp } from '../actions';
import Card from '~/components/general/Card';
import EnvVarsSettings from '~/components/env-vars/EnvVarsSettings';
import { SWRConfig } from 'swr';
import fetchAppEnvVars from '~/queries/fetchAppEnvVars';

export default async function AppEnvVarsPage({
  params,
}: {
  params: Promise<{ appName: string }>;
}) {
  const { appName } = await params;
  const app = await fetchApp(appName);

  if (!app) {
    return <div>App not found</div>;
  }

  const appEnvVars = await fetchAppEnvVars(app.id, false);
  const appPreviewEnvVars = await fetchAppEnvVars(app.id, true);

  return (
    <SWRConfig
      value={{
        fallback: {
          [`/api/apps/${app.id}/env-vars?isPreview=false`]: appEnvVars,
          [`/api/apps/${app.id}/env-vars?isPreview=true`]: appPreviewEnvVars,
        },
      }}
    >
      <Card
        className="bg-white text-black mb-8"
        title="Environment Variables"
        padding="content"
        content={<EnvVarsSettings app={app} />}
      />
    </SWRConfig>
  );
}
