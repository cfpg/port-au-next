import { fetchApp } from '../actions';
import Panel from '~/components/general/Panel';
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
      <Panel
        title="Environment Variables"
        content={<EnvVarsSettings app={app} />}
      />
    </SWRConfig>
  );
}
