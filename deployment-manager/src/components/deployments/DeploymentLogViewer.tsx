'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import useSWR from 'swr';

import NginxLogTable from '~/components/deployments/NginxLogTable';
import Badge from '~/components/general/Badge';
import Button from '~/components/general/Button';
import { getServiceStatusColor } from '~/utils/serviceColors';
import fetcher from '~/utils/fetcher';
import { AppDeployment, DeploymentLog, ServiceStatus } from '~/types';

type LogTab = 'deploy' | 'access' | 'error';

const AUTO_REFRESH_INTERVAL_SEC = 4;
const SCROLL_PAUSE_THRESHOLD_PX = 40;

interface FileLogResponse {
  deploymentId: number;
  appName: string;
  path: string;
  sizeBytes: number;
  truncated: boolean;
  content: string;
}

interface DeploymentLogViewerProps {
  app: AppDeployment;
  deploymentId: number;
  appName: string;
  deployLogs: DeploymentLog[];
  deployLoading?: boolean;
  deployError?: unknown;
  onRefreshDeploy: () => void | Promise<void>;
}

function getAutoRefreshLabel(
  autoRefresh: boolean,
  pausedByScroll: boolean,
  isUpdating: boolean,
  countdown: number
): string {
  if (!autoRefresh) {
    return 'Auto-refresh';
  }
  if (pausedByScroll) {
    return 'Auto-refresh (Paused)';
  }
  if (isUpdating) {
    return 'Auto-refresh (Updating)';
  }
  return `Auto-refresh (${countdown}s)`;
}

export default function DeploymentLogViewer({
  app,
  deploymentId,
  appName,
  deployLogs,
  deployLoading = false,
  deployError,
  onRefreshDeploy,
}: DeploymentLogViewerProps) {
  const [activeTab, setActiveTab] = useState<LogTab>('deploy');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pausedByScroll, setPausedByScroll] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_INTERVAL_SEC);
  const [isUpdating, setIsUpdating] = useState(false);

  const accessKey =
    activeTab === 'access'
      ? `/api/apps/deployments/${appName}/${deploymentId}/logs/access`
      : null;
  const errorKey =
    activeTab === 'error'
      ? `/api/apps/deployments/${appName}/${deploymentId}/logs/error`
      : null;

  const {
    data: accessData,
    error: accessError,
    isLoading: accessLoading,
    mutate: refreshAccess,
  } = useSWR<FileLogResponse>(accessKey, fetcher);

  const {
    data: errorData,
    error: errorError,
    isLoading: errorLoading,
    mutate: refreshError,
  } = useSWR<FileLogResponse>(errorKey, fetcher);

  const sortedDeployLogs = useMemo(
    () =>
      [...deployLogs].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [deployLogs]
  );

  const refreshActive = useCallback(async () => {
    if (activeTab === 'deploy') {
      await onRefreshDeploy();
    } else if (activeTab === 'access') {
      await refreshAccess();
    } else if (activeTab === 'error') {
      await refreshError();
    }
  }, [activeTab, onRefreshDeploy, refreshAccess, refreshError]);

  const refreshActiveRef = useRef(refreshActive);
  refreshActiveRef.current = refreshActive;

  useEffect(() => {
    setPausedByScroll(false);
  }, [activeTab]);

  useEffect(() => {
    if (!autoRefresh || pausedByScroll) {
      setCountdown(AUTO_REFRESH_INTERVAL_SEC);
      setIsUpdating(false);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const runCountdownStep = (seconds: number) => {
      if (cancelled) {
        return;
      }
      setCountdown(seconds);

      if (seconds > 1) {
        timeoutId = setTimeout(() => runCountdownStep(seconds - 1), 1000);
        return;
      }

      timeoutId = setTimeout(() => {
        if (cancelled) {
          return;
        }
        setIsUpdating(true);
        void refreshActiveRef.current().finally(() => {
          if (cancelled) {
            return;
          }
          setIsUpdating(false);
          runCountdownStep(AUTO_REFRESH_INTERVAL_SEC);
        });
      }, 1000);
    };

    setIsUpdating(false);
    runCountdownStep(AUTO_REFRESH_INTERVAL_SEC);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [autoRefresh, pausedByScroll, activeTab]);

  const tabs: { id: LogTab; label: string }[] = [
    { id: 'deploy', label: 'Deploy' },
    { id: 'access', label: 'Access' },
    { id: 'error', label: 'Error' },
  ];

  const autoRefreshLabel = getAutoRefreshLabel(
    autoRefresh,
    pausedByScroll,
    isUpdating,
    countdown
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-4">
      <div className="flex flex-col gap-2 shrink-0">
        <h2 className="text-lg font-semibold">Deployment Details</h2>
        <div className="grid grid-cols-2 gap-2">
          <p className="text-sm text-gray-600">
            <strong>App Name:</strong> {app.name}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Deployment ID:</strong> {deploymentId}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Deployment Date:</strong>{' '}
            {new Date(app.deployed_at || '').toLocaleString()}
          </p>
          <p className="text-sm text-gray-600">
            <strong>Status:</strong>{' '}
            <Badge color={getServiceStatusColor(app.status as ServiceStatus)} withDot>
              {app.status}
            </Badge>
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-gray-200 shrink-0">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none min-w-[10.5rem]">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(event) => setAutoRefresh(event.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="tabular-nums">{autoRefreshLabel}</span>
          </label>
          <Button color="gray-light" size="sm" onClick={() => void refreshActive()}>
            <i className="fas fa-sync-alt mr-2"></i>
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
      {activeTab === 'deploy' && (
        <DeployTabContent
          logs={sortedDeployLogs}
          loading={deployLoading && deployLogs.length === 0}
          error={deployError}
          onScrollPausedChange={setPausedByScroll}
        />
      )}

      {activeTab === 'access' && (
        <FileLogTabContent
          label="Access log"
          logVariant="access"
          data={accessData}
          loading={accessLoading && !accessData}
          error={accessError}
          emptyHint="Access logs are recorded after traffic is switched to this deployment."
          onScrollPausedChange={setPausedByScroll}
        />
      )}

      {activeTab === 'error' && (
        <FileLogTabContent
          label="Error log"
          logVariant="error"
          data={errorData}
          loading={errorLoading && !errorData}
          error={errorError}
          emptyHint="Error logs are recorded after traffic is switched to this deployment."
          onScrollPausedChange={setPausedByScroll}
        />
      )}
      </div>
    </div>
  );
}

function LogScrollArea({
  children,
  onScrollPausedChange,
}: {
  children: ReactNode;
  onScrollPausedChange: (paused: boolean) => void;
}) {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      onScroll={(event) => {
        onScrollPausedChange(event.currentTarget.scrollTop > SCROLL_PAUSE_THRESHOLD_PX);
      }}
    >
      {children}
    </div>
  );
}

function DeployTabContent({
  logs,
  loading,
  error,
  onScrollPausedChange,
}: {
  logs: DeploymentLog[];
  loading: boolean;
  error: unknown;
  onScrollPausedChange: (paused: boolean) => void;
}) {
  if (error) {
    return <p className="text-red-500 text-center py-4">Error loading deploy logs.</p>;
  }

  if (loading) {
    return <p className="text-gray-500 text-center py-4">Loading deploy logs...</p>;
  }

  if (logs.length === 0) {
    return <p className="text-gray-500 text-center py-4">No deploy logs found.</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
    <LogScrollArea onScrollPausedChange={onScrollPausedChange}>
      <div className="space-y-4">
        {logs.map((log) => (
          <div key={log.id} className={`log-entry p-4 rounded ${getLogTypeClass(log.type)}`}>
            <div className="flex items-start justify-between">
              <span className="font-mono text-xs text-gray-500">
                {new Date(log.created_at).toLocaleString()}
              </span>
              <span className="uppercase text-xs font-semibold ml-2">{log.type}</span>
            </div>
            <div className="mt-1">{log.message}</div>
            {log.metadata && Object.keys(log.metadata).length > 0 && (
              <pre className="text-xs mt-2 text-gray-600 whitespace-pre-wrap break-words">
                {JSON.stringify(log.metadata, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </LogScrollArea>
    </div>
  );
}

function FileLogTabContent({
  label,
  logVariant,
  data,
  loading,
  error,
  emptyHint,
  onScrollPausedChange,
}: {
  label: string;
  logVariant: 'access' | 'error';
  data?: FileLogResponse;
  loading: boolean;
  error: unknown;
  emptyHint: string;
  onScrollPausedChange: (paused: boolean) => void;
}) {
  if (loading) {
    return <p className="text-gray-500 text-center py-4">Loading {label.toLowerCase()}...</p>;
  }

  if (error) {
    return (
      <div className="text-center py-4 space-y-2">
        <p className="text-gray-500">{emptyHint}</p>
        <p className="text-sm text-gray-400">Log file not available yet.</p>
      </div>
    );
  }

  if (!data) {
    return <p className="text-gray-500 text-center py-4">No data found.</p>;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-2">
      <details className="text-xs text-gray-500 shrink-0">
        <summary className="cursor-pointer hover:text-gray-700">File path</summary>
        <code className="block mt-1 break-all">{data.path}</code>
        {data.truncated && (
          <span className="block mt-1 text-amber-600">
            Showing last portion of file ({data.sizeBytes.toLocaleString()} bytes total).
            Newest entries appear at the top.
          </span>
        )}
      </details>
      <LogScrollArea onScrollPausedChange={onScrollPausedChange}>
        <div className="rounded border border-gray-200 bg-white min-h-full">
          <NginxLogTable content={data.content} variant={logVariant} />
        </div>
      </LogScrollArea>
    </div>
  );
}

function getLogTypeClass(type: string): string {
  switch (type) {
    case 'error':
      return 'bg-red-50 border-l-4 border-red-500';
    case 'warning':
      return 'bg-yellow-50 border-l-4 border-yellow-500';
    case 'debug':
      return 'bg-gray-50 border-l-4 border-gray-500';
    default:
      return 'bg-blue-50 border-l-4 border-blue-500';
  }
}
