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
    <div className={`log-entry p-4 rounded ${getLogTypeClass(logType)}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-xs text-gray-500 shrink-0">
          {new Date(log.created_at).toLocaleString()}
        </span>
        <span className="uppercase text-xs font-semibold ml-2 shrink-0">{logType}</span>
      </div>
      <div className="mt-1 whitespace-pre-wrap break-words">{log.message}</div>

      {skipMetadata && (
        <p className="text-xs text-gray-500 mt-2">
          Full build output is on the <strong>Build</strong> tab
          {buildLogPath ? (
            <>
              {' '}
              (<code className="break-all">{buildLogPath}</code>)
            </>
          ) : null}
          .
        </p>
      )}

      {metadata && !skipMetadata && <DeploymentLogMetadata metadata={metadata} />}
    </div>
  );
}
