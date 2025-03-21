"use client";

import { getStatusColor } from '~/utils/status';
import Link from '~/components/general/Link';
import getSingleAppPath from '~/utils/getSingleAppPath';
import { App } from '~/types';
import AppDeployButton from '~/components/buttons/AppDeployButton';

interface AppsTableProps {
  apps: App[];
}

export default function AppsTable({
  apps,
}: AppsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 rounded-b-lg">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Repository
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Branch
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Domain
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Deployment
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200 rounded-b-lg">
          {apps.map((app) => (
            <tr key={app.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                <Link href={getSingleAppPath(app.name)} variant="nav" className='underline text-blue-500 hover:text-blue-700'>{app.name}</Link>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.repo_url}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.branch}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <a href={`https://${app.domain}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline">{app.domain}</a>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(app.status)}`}>
                  {app.status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {app.last_deployment ? new Date(app.last_deployment.deployed_at).toLocaleString() : 'Never'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                <AppDeployButton appName={app.name} />
                <Link
                  href={getSingleAppPath(app.name)}
                  color="yellow"
                  size="sm"
                  variant="button"
                >
                  <i className="fas fa-gear mr-2"></i>
                  Settings
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}