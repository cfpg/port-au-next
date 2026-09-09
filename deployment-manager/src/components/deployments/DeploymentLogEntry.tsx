'use client';

import DeploymentLogMetadata from '~/components/deployments/DeploymentLogMetadata';
import {
  getLogTypeClass,
  normalizeDeploymentLogMetadata,
  normalizeDeploymentLogType,
} from '~/lib/deploymentLogDisplay';
import { DeploymentLog } from '~/types';

interface DeploymentLogEntryProps {
  log: DeploymentLog;
  /** When true, inline build blobs are omitted (use Build tab). */
  hideInlineBuildLog?: boolean;
}

export default function DeploymentLogEntry({
  log,
  hideInlineBuildLog = false,
}: DeploymentLogEntryProps) {
  const logType = normalizeDeploymentLogType(log.type);
  const metadata = normalizeDeploymentLogMetadata(log.metadata);
  const skipMetadata = hideInlineBuildLog && log.message === 'Docker build log';

  const buildLogPath =
    typeof metadata?.buildLogPath === 'string' ? metadata.buildLogPath : null;

  return (
    <div className={`p-11 rounded-control ${getLogTypeClass(logType)}`}>
      <div className="flex items-start justify-between gap-9">
        <span className="font-mono text-mini text-ink-faint shrink-0">
          {new Date(log.created_at).toLocaleString()}
        </span>
        <span className="font-mono text-mini font-semibold uppercase text-ink-muted shrink-0">{logType}</span>
      </div>
      <div className="mt-3 text-field text-ink whitespace-pre-wrap break-words">{log.message}</div>

      {skipMetadata && (
        <p className="text-mini text-ink-faint mt-9">
          Full build output is on the <strong className="font-semibold text-ink-muted">Build</strong> tab
          {buildLogPath ? (
            <>
              {' '}
              (<span className="font-mono text-micro break-all">{buildLogPath}</span>)
            </>
          ) : null}
          .
        </p>
      )}

      {metadata && !skipMetadata && <DeploymentLogMetadata metadata={metadata} />}
    </div>
  );
}
