'use client';

import {
  extractMetadataTextBlocks,
  metadataForCompactJson,
} from '~/lib/deploymentLogDisplay';

interface DeploymentLogMetadataProps {
  metadata: Record<string, unknown>;
}

export default function DeploymentLogMetadata({ metadata }: DeploymentLogMetadataProps) {
  const textBlocks = extractMetadataTextBlocks(metadata);
  const compact = metadataForCompactJson(metadata);

  if (textBlocks.length === 0 && !compact) {
    return null;
  }

  return (
    <div className="mt-2 space-y-2">
      {textBlocks.map((block) => (
        <div key={block.label}>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            {block.label}
          </span>
          <pre className="text-xs mt-0.5 text-gray-800 whitespace-pre-wrap break-words font-mono bg-white/60 rounded p-2 border border-gray-200 max-h-[min(24rem,50vh)] overflow-y-auto">
            {block.text}
          </pre>
        </div>
      ))}

      {compact && (
        <pre className="text-xs text-gray-600 whitespace-pre-wrap break-words font-mono">
          {JSON.stringify(compact, null, 2)}
        </pre>
      )}
    </div>
  );
}
