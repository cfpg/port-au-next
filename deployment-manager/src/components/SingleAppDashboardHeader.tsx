"use client";

import { ServiceStatus } from "~/types";
import Panel from "./general/Panel";
import Badge from "./general/Badge";
import DefinitionList from "./general/DefinitionList";
import { getServiceStatusTone } from "~/utils/serviceColors";
import RelativeTime from "~/components/general/RelativeTime";
import AppDeployButton from "./buttons/AppDeployButton";
import AppDeleteButton from "./buttons/AppDeleteButton";
import useSWR from "swr";
import fetcher from "~/utils/fetcher";

export default function SingleAppDashboardHeader({ appId }: { appId: number }) {
  const { data: app } = useSWR(`/api/apps/${appId}`, fetcher, { refreshInterval: 10000 });

  if (!app) {
    return null;
  }

  return (
    <Panel
      header={
        <>
          <div className="flex items-center gap-11">
            <h3 className="font-display font-bold text-resource tracking-subhead m-0">{app.name}</h3>
            <Badge tone={getServiceStatusTone(app.status as ServiceStatus)} withDot>
              {app.status}
            </Badge>
          </div>
          <div className="flex items-center gap-7">
            <AppDeployButton app={app} showDropdown={true} />
            <AppDeleteButton appName={app.name} />
          </div>
        </>
      }
      content={
        <DefinitionList
          className="border-0 p-0"
          items={[
            { label: 'Repository', value: app.repo_url },
            { label: 'Branch', value: app.branch },
            {
              label: 'Domain',
              value: app.domain ? (
                <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="underline decoration-primary-line underline-offset-2">
                  {app.domain}
                </a>
              ) : (
                <span className="text-ink-ghost">Not set</span>
              ),
            },
            {
              label: 'Last Deployment',
              value: app.last_deployment ? (
                <RelativeTime value={app.last_deployment.deployed_at} showRelative />
              ) : (
                <span className="text-ink-ghost">Never</span>
              ),
            },
          ]}
        />
      }
    />
  );
}
