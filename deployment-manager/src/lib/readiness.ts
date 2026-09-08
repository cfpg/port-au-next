export type ReadinessReason =
  | 'initializing'
  | 'ready'
  | 'migration_failed'
  | 'critical_startup_failed';

export type ReadinessState = {
  ready: boolean;
  reason: ReadinessReason;
  changedAt: string;
};

type ReadinessGlobal = typeof globalThis & {
  __portAuNextDeploymentManagerReadiness?: ReadinessState;
};

const readinessGlobal = globalThis as ReadinessGlobal;

function setReadiness(ready: boolean, reason: ReadinessReason): ReadinessState {
  const state = {
    ready,
    reason,
    changedAt: new Date().toISOString(),
  };

  readinessGlobal.__portAuNextDeploymentManagerReadiness = state;
  return state;
}

export function getReadiness(): ReadinessState {
  return (
    readinessGlobal.__portAuNextDeploymentManagerReadiness ??
    setReadiness(false, 'initializing')
  );
}

export function markStarting(): ReadinessState {
  return setReadiness(false, 'initializing');
}

export function markReady(): ReadinessState {
  return setReadiness(true, 'ready');
}

export function markStartupFailed(reason: Exclude<ReadinessReason, 'initializing' | 'ready'>): ReadinessState {
  return setReadiness(false, reason);
}
