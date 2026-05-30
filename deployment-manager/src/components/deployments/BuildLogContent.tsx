'use client';

import { classifyBuildLogLine, getBuildLineClass } from '~/lib/deploymentLogDisplay';

interface BuildLogContentProps {
  content: string;
}

export default function BuildLogContent({ content }: BuildLogContentProps) {
  const lines = content.split('\n');

  return (
    <div className="font-mono text-xs">
      {lines.map((line, index) => {
        const level = classifyBuildLogLine(line);
        return (
          <div
            key={`${index}-${line.slice(0, 24)}`}
            className={`flex gap-2 px-2 py-0.5 border-b border-gray-100 last:border-0 ${getBuildLineClass(level)}`}
          >
            <span
              className={`uppercase text-[10px] font-semibold w-14 shrink-0 pt-0.5 opacity-80 ${level === 'info' ? 'text-gray-400' : ''}`}
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
    <p className="text-xs text-gray-500 shrink-0">
      Line levels are inferred from build output (error, warning, debug, info).
    </p>
  );
}
