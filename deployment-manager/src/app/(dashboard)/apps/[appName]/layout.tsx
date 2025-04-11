import { fetchApp } from "./actions";
import AppNavigation from "~/components/navigation/AppNavigation";
import { SWRConfig } from "swr";
import SingleAppDashboardHeader from "~/components/SingleAppDashboardHeader";
export default async function SingleAppLayout({ params, children }: { params: Promise<{ appName: string }>, children: React.ReactNode }) {
  const { appName } = await params;
  const app = await fetchApp(appName);

  if (!app) {
    return <div>App not found</div>;
  }

  return (
    <SWRConfig
      value={{
        fallback: {
          [`/api/apps/${app.id}`]: app
        }
      }}
    >
      <div className="mb-8">
        <SingleAppDashboardHeader appId={app.id} />
      </div>

      <AppNavigation appName={appName} />

      {/* Children */}
      <div>
        {children}
      </div>
    </SWRConfig>
  )
}