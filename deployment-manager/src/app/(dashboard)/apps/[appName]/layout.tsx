import Card from "~/components/general/Card";
import Badge from "~/components/general/Badge";
import { getServiceStatusColor } from "~/utils/serviceColors";
import getRelativeTime from "~/utils/getRelativeTime";
import { ServiceStatus } from "~/types";
import { fetchApp } from "./actions";
import AppNavigation from "~/components/navigation/AppNavigation";
import AppDeployButton from "~/components/buttons/AppDeployButton";
import AppDeleteButton from "~/components/buttons/AppDeleteButton";
import { SWRConfig } from "swr";

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
        <Card
          className="bg-white text-black"
          header={
            <>
              <h3 className="text-2xl font-bold">{app.name}</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-4">
                  <Badge color={getServiceStatusColor(app.status as ServiceStatus)} withDot>
                    {app.status}
                  </Badge>
                  <AppDeployButton app={app} showDropdown={true} />
                  <AppDeleteButton appName={app.name} />
                </div>
              </div>
            </>
          }
          content={
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">Repository</h3>
                <p className="text-sm text-gray-500">{app.repo_url}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Branch</h3>
                <p className="text-sm text-gray-500">{app.branch}</p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Domain</h3>
                <p className="text-sm text-gray-500">
                  {
                    app.domain ?
                      <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">{app.domain}</a> : 'Not set'
                  }
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Last Deployment</h3>
                <p className="text-sm text-gray-500">
                  {app.last_deployment ? (
                    <>
                      {new Date(app.last_deployment.deployed_at).toLocaleString()}
                      <span className="text-gray-400"> ({getRelativeTime(app.last_deployment.deployed_at)})</span>
                    </>
                  ) : 'Never'}
                </p>
              </div>
            </div>
          }
        />
      </div>

      <AppNavigation appName={appName} />

      {/* Children */}
      <div>
        {children}
      </div>
    </SWRConfig>
  )
}