'use client';

import { classifyBuildLogLine, getBuildLineClass } from '~/lib/deploymentLogDisplay';

interface BuildLogContentProps {
  content: string;
}

export default function BuildLogContent({ content }: BuildLogContentProps) {
  const lines = content.split('\n');

  return (
    <div className="font-mono text-mini">
      {lines.map((line, index) => {
        const level = classifyBuildLogLine(line);
        return (
          <div
            key={`${index}-${line.slice(0, 24)}`}
            className={`flex gap-6 px-6 py-1 border-b border-line-soft last:border-0 ${getBuildLineClass(level)}`}
          >
            <span
              className={`uppercase text-nano font-semibold w-38 shrink-0 pt-1 opacity-80 ${level === 'info' ? 'text-ink-faint' : ''}`}
            >
              {level}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-words min-w-0">{line || ' '}</span>
          </div>
        );
      })}
    </div>
  );
}

export function BuildLogLevelLegend() {
  return (
    <p className="text-mini text-ink-faint shrink-0">
      Line levels are inferred from build output (error, warning, debug, info).
    </p>
  );
}
