"use client";

import { ServiceStatus } from "~/types";
import Card from "./general/Card";
import Badge from "./general/Badge";
import { getServiceStatusColor } from "~/utils/serviceColors";
import getRelativeTime from "~/utils/getRelativeTime";
import AppDeployButton from "./buttons/AppDeployButton";
import AppDeleteButton from "./buttons/AppDeleteButton";
import useSWR from "swr";
import fetcher from "~/utils/fetcher";

export default function SingleAppDashboardHeader({ appId }: { appId: number }) {
  const { data: app } = useSWR(`/api/apps/${appId}`, fetcher, { refreshInterval: 10000 });

  return (
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
  )

}