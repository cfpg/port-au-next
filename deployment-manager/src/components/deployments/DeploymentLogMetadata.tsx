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
    <div className="mt-9 flex flex-col gap-9">
      {textBlocks.map((block) => (
        <div key={block.label}>
          <span className="font-mono text-nano font-semibold uppercase tracking-caps text-ink-faint">
            {block.label}
          </span>
          <pre className="text-mini mt-2 text-ink-muted whitespace-pre-wrap break-words font-mono bg-surface/60 rounded-control p-9 border border-line max-h-[min(24rem,50vh)] overflow-y-auto">
            {block.text}
          </pre>
        </div>
      ))}

      {compact && (
        <pre className="text-mini text-ink-muted whitespace-pre-wrap break-words font-mono">
          {JSON.stringify(compact, null, 2)}
        </pre>
      )}
    </div>
  );
}
