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

import BuildLogContent, { BuildLogLevelLegend } from '~/components/deployments/BuildLogContent';
import DeploymentLogEntry from '~/components/deployments/DeploymentLogEntry';
import NginxLogTable from '~/components/deployments/NginxLogTable';
import type { FileLogResponse } from '~/components/deployments/deploymentLogTypes';
import Badge from '~/components/general/Badge';
import Button from '~/components/general/Button';
import Checkbox from '~/components/general/Checkbox';
import DefinitionList from '~/components/general/DefinitionList';
import Callout from '~/components/general/Callout';
import EmptyState from '~/components/general/EmptyState';
import { RefreshIcon } from '~/components/general/icons';
import {
  extractBuildLogText,
  normalizeDeploymentLogMetadata,
} from '~/lib/deploymentLogDisplay';
import { isDeploymentInFlight } from '~/lib/deploymentLogStatus';
import { getServiceStatusTone } from '~/utils/serviceColors';
import { fileLogFetcher } from '~/utils/fileLogFetcher';
import { AppDeployment, DeploymentLog, ServiceStatus } from '~/types';

type LogTab = 'deploy' | 'build' | 'access' | 'error';

const AUTO_REFRESH_INTERVAL_SEC = 4;
const SCROLL_PAUSE_THRESHOLD_PX = 40;

const TAB_SORT_LABELS: Record<LogTab, string> = {
  deploy: 'Oldest first',
  build: 'Oldest first',
  access: 'Newest first',
  error: 'Newest first',
};

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
  activeTab: LogTab,
  autoRefresh: boolean,
  pausedByScroll: boolean,
  isUpdating: boolean,
  countdown: number
): string {
  if (activeTab === 'deploy' || activeTab === 'build') {
    return 'Auto-refresh (Paused)';
  }

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

  const deployInFlight = isDeploymentInFlight(app.status);
  const deployScrollRef = useRef<HTMLDivElement>(null);

  const accessKey =
    activeTab === 'access'
      ? `/api/apps/deployments/${appName}/${deploymentId}/logs/access`
      : null;
  const errorKey =
    activeTab === 'error'
      ? `/api/apps/deployments/${appName}/${deploymentId}/logs/error`
      : null;
  const buildKey =
    activeTab === 'build'
      ? `/api/apps/deployments/${appName}/${deploymentId}/logs/build`
      : null;

  const {
    data: accessData,
    error: accessError,
    isLoading: accessLoading,
    mutate: refreshAccess,
  } = useSWR<FileLogResponse>(accessKey, fileLogFetcher);

  const {
    data: errorData,
    error: errorError,
    isLoading: errorLoading,
    mutate: refreshError,
  } = useSWR<FileLogResponse>(errorKey, fileLogFetcher);

  const {
    data: buildData,
    error: buildError,
    isLoading: buildLoading,
    mutate: refreshBuild,
  } = useSWR<FileLogResponse>(buildKey, fileLogFetcher);

  const sortedDeployLogs = useMemo(
    () =>
      [...deployLogs].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [deployLogs]
  );

  const deployLogBuildFallback = useMemo(() => {
    const dockerLog = deployLogs.find((log) => log.message === 'Docker build log');
    return extractBuildLogText(normalizeDeploymentLogMetadata(dockerLog?.metadata));
  }, [deployLogs]);

  const refreshActive = useCallback(async () => {
    if (activeTab === 'deploy') {
      await onRefreshDeploy();
    } else if (activeTab === 'access') {
      await refreshAccess();
    } else if (activeTab === 'error') {
      await refreshError();
    } else if (activeTab === 'build') {
      await refreshBuild();
    }
  }, [activeTab, onRefreshDeploy, refreshAccess, refreshError, refreshBuild]);

  const refreshActiveRef = useRef(refreshActive);
  refreshActiveRef.current = refreshActive;

  const onRefreshDeployRef = useRef(onRefreshDeploy);
  onRefreshDeployRef.current = onRefreshDeploy;

  useEffect(() => {
    if (activeTab === 'deploy') {
      setPausedByScroll(false);
      return;
    }
    setPausedByScroll(false);
  }, [activeTab]);

  const buildRefreshRef = useRef(refreshBuild);
  buildRefreshRef.current = refreshBuild;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Deploy / Build tabs: poll while deployment is in-flight (ignores checkbox / scroll pause).
  useEffect(() => {
    if (!deployInFlight) {
      return;
    }
    if (activeTab !== 'deploy' && activeTab !== 'build') {
      return;
    }

    const intervalId = setInterval(() => {
      if (activeTabRef.current === 'deploy') {
        void onRefreshDeployRef.current();
      } else if (activeTabRef.current === 'build') {
        void buildRefreshRef.current();
      }
    }, AUTO_REFRESH_INTERVAL_SEC * 1000);

    return () => clearInterval(intervalId);
  }, [activeTab, deployInFlight]);

  // Scroll deploy log to bottom when new entries arrive during an in-flight deploy.
  useEffect(() => {
    if (activeTab !== 'deploy' || !deployInFlight || !deployScrollRef.current) {
      return;
    }
    deployScrollRef.current.scrollTop = deployScrollRef.current.scrollHeight;
  }, [activeTab, deployInFlight, sortedDeployLogs.length]);

  // Access / Error: checkbox-driven countdown refresh with scroll pause.
  useEffect(() => {
    if (activeTab === 'deploy' || !autoRefresh || pausedByScroll) {
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
    { id: 'build', label: 'Build' },
    { id: 'access', label: 'Access' },
    { id: 'error', label: 'Error' },
  ];

  const autoRefreshLabel = getAutoRefreshLabel(
    activeTab,
    autoRefresh,
    pausedByScroll,
    isUpdating,
    countdown
  );

  const sortLabel = TAB_SORT_LABELS[activeTab];
  const checkboxDisabled = activeTab === 'deploy' || activeTab === 'build';

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-14">
      <div className="flex flex-col gap-9 shrink-0">
        <div className="font-display font-semibold text-panel">Deployment Details</div>
        <DefinitionList
          columns={2}
          items={[
            { label: 'App Name', value: app.name },
            { label: 'Deployment ID', value: deploymentId },
            { label: 'Deployment Date', value: new Date(app.deployed_at || '').toLocaleString() },
            { label: 'Status', value: <Badge tone={getServiceStatusTone(app.status as ServiceStatus)} withDot>{app.status}</Badge> },
          ]}
        />
      </div>

      <div className="flex items-center justify-between border-b border-line shrink-0 gap-10 flex-wrap">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-13 py-7 font-display font-semibold text-field border-b-2 -mb-1 cursor-pointer transition-colors duration-100 ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-14 shrink-0 flex-wrap justify-end py-7">
          <span className="font-mono text-micro text-ink-faint">{sortLabel}</span>
          <Checkbox
            checked={checkboxDisabled ? false : autoRefresh}
            disabled={checkboxDisabled}
            onChange={setAutoRefresh}
            label={<span className="tabular-nums text-field">{autoRefreshLabel}</span>}
          />
          <Button variant="secondary" size="sm" onClick={() => void refreshActive()}>
            <RefreshIcon />
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
            scrollRef={deployScrollRef}
            liveUpdating={deployInFlight}
          />
        )}

        {activeTab === 'build' && (
          <BuildTabContent
            data={buildData}
            loading={buildLoading && !buildData}
            error={buildError}
            fallbackContent={deployLogBuildFallback}
            onScrollPausedChange={setPausedByScroll}
            liveUpdating={deployInFlight}
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
  onScrollPausedChange?: (paused: boolean) => void;
}) {
  return (
    <div
      className="flex-1 min-h-0 overflow-y-auto"
      onScroll={
        onScrollPausedChange
          ? (event) => {
              onScrollPausedChange(
                event.currentTarget.scrollTop > SCROLL_PAUSE_THRESHOLD_PX
              );
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function LiveIndicator() {
  return (
    <p className="font-mono text-micro text-primary shrink-0">
      Live, updating every {AUTO_REFRESH_INTERVAL_SEC}s while deployment is in progress
    </p>
  );
}

function DeployTabContent({
  logs,
  loading,
  error,
  scrollRef,
  liveUpdating,
}: {
  logs: DeploymentLog[];
  loading: boolean;
  error: unknown;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  liveUpdating: boolean;
}) {
  if (error) {
    return <Callout tone="danger">Error loading deploy logs.</Callout>;
  }

  if (loading) {
    return <div className="text-center py-24 text-ink-faint text-field">Loading deploy logs...</div>;
  }

  if (logs.length === 0) {
    return <EmptyState title="No deploy logs found" />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-9">
      {liveUpdating && <LiveIndicator />}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-14">
          {logs.map((log) => (
            <DeploymentLogEntry key={log.id} log={log} hideInlineBuildLog />
          ))}
        </div>
      </div>
    </div>
  );
}

function BuildTabContent({
  data,
  loading,
  error,
  fallbackContent,
  onScrollPausedChange,
  liveUpdating,
}: {
  data?: FileLogResponse;
  loading: boolean;
  error: unknown;
  fallbackContent: string | null;
  onScrollPausedChange: (paused: boolean) => void;
  liveUpdating: boolean;
}) {
  const content = data?.content ?? fallbackContent;

  if (loading && !content) {
    return <div className="text-center py-24 text-ink-faint text-field">Loading build log...</div>;
  }

  if (!content) {
    return (
      <EmptyState
        title="Build log is written during the docker build phase"
        description={error instanceof Error ? error.message : 'Log file not available yet.'}
      />
    );
  }

  return (
    <FileLogTabContent
      label="Build log"
      data={
        data ?? {
          deploymentId: 0,
          appName: '',
          path: '(from deployment log snapshot)',
          sizeBytes: content.length,
          truncated: false,
          content,
        }
      }
      loading={false}
      error={undefined}
      emptyHint=""
      onScrollPausedChange={onScrollPausedChange}
      renderContent={(fileContent) => (
        <>
          {!data?.content && fallbackContent && (
            <p className="text-mini text-warning-ink px-9 py-6 bg-warning-tint border-b border-warning-line">
              Showing build output saved on the Deploy log (build file not found on disk).
            </p>
          )}
          <BuildLogLevelLegend />
          <BuildLogContent content={fileContent} />
        </>
      )}
      liveUpdating={liveUpdating && Boolean(data?.content)}
    />
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
  renderContent,
  liveUpdating = false,
}: {
  label: string;
  logVariant?: 'access' | 'error';
  data?: FileLogResponse;
  loading: boolean;
  error: unknown;
  emptyHint: string;
  onScrollPausedChange: (paused: boolean) => void;
  renderContent?: (content: string) => ReactNode;
  liveUpdating?: boolean;
}) {
  if (loading) {
    return <div className="text-center py-24 text-ink-faint text-field">Loading {label.toLowerCase()}...</div>;
  }

  if (error) {
    return (
      <EmptyState
        title={emptyHint}
        description={error instanceof Error ? error.message : 'Log file not available yet.'}
      />
    );
  }

  if (!data?.content) {
    return <EmptyState title={emptyHint} description="Log file not available yet." />;
  }

  const truncatedNote = data.truncated
    ? logVariant === 'access' || logVariant === 'error'
      ? 'Newest entries appear at the top.'
      : 'Showing the end of the file (oldest lines may be omitted).'
    : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full gap-9">
      {liveUpdating && <LiveIndicator />}
      <details className="font-mono text-micro text-ink-faint shrink-0">
        <summary className="cursor-pointer hover:text-ink-muted">File path</summary>
        <span className="block mt-3 break-all">{data.path}</span>
        {data.truncated && (
          <span className="block mt-3 text-warning-deep">
            Showing last portion of file ({data.sizeBytes.toLocaleString()} bytes total).
            {truncatedNote ? ` ${truncatedNote}` : null}
          </span>
        )}
      </details>
      <LogScrollArea onScrollPausedChange={onScrollPausedChange}>
        <div className="rounded-control border border-line bg-surface min-h-full">
          {renderContent ? (
            renderContent(data.content)
          ) : (
            <NginxLogTable content={data.content} variant={logVariant!} />
          )}
        </div>
      </LogScrollArea>
    </div>
  );
}
