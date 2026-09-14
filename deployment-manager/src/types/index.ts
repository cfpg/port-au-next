export interface Deployment {
  id: number;
  app_id: number;
  app_name: string;
  app_repository: string;
  version: string;
  commit_id?: string;
  status: string;
  deployed_at: string;
  container_id?: string;
  branch?: string;
  /**
   * True for a synthetic row representing a deploy_queue_jobs entry that hasn't produced
   * a real `deployments` row yet (queued, or claimed but not yet linked). `id` on such a
   * row is a placeholder for React/table keying only - never a real deployment id, so
   * deployment-scoped actions (view logs, redeploy, copy SHA) must be hidden when this is
   * true rather than passed a fake id.
   */
  isQueued?: boolean;
  /** The deploy_queue_jobs.id backing an isQueued row. */
  queueJobId?: number;
  /** Redacted error text for a queue job that failed before a deployment row existed. */
  queueError?: string;
}

export interface DeploymentLog {
  id: number;
  deployment_id: number;
  message: string;
  type: string;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface App {
  id: number;
  name: string;
  repo_url: string;
  branch: string;
  domain?: string;
  db_name?: string;
  db_user?: string;
  db_password?: string;
  cloudflare_zone_id?: string;
  env?: Record<string, string>;
  preview_domain?: string;
  root_path?: string;
  /**
   * Precedence-derived: an in-progress deployment's own status, else 'queued' if a
   * request is waiting with nothing executing, else the last deployment's status (or
   * 'stopped'). See utils/appStatus.ts's deriveAppStatus - the single source of this
   * logic, not duplicated elsewhere.
   */
  status: string;
  last_deployment?: {
    version: string;
    commit_id: string;
    status: string;
    deployed_at: Date;
  };
  /**
   * Later of the last real deployment's time and the oldest waiting queue request's
   * request time - ordering-only (see utils/appStatus.ts's deriveActivityAt). Never
   * substitutes for `last_deployment.deployed_at`, which stays the real deployment time.
   */
  activity_at?: string | null;
}

export interface AppDeployment  {
  id: number;
  name: string;
  repo_url: string;
  branch: string;
  status: string;
  deployed_at: Date;
}

export interface AppSettings {
  name: string;
  repo_url: string;
  branch: string;
  domain?: string;
  cloudflare_zone_id?: string;
  root_path?: string;
} 


export type Service = 'nginx' | 'postgres' | 'redis' | 'imgproxy' | 'minio' | 'umami' | 'bugsink';
export type ServiceStatus =
  | 'running'
  | 'stopped'
  | 'unknown'
  | 'pending'
  | 'building'
  | 'preflight'
  | 'migrating'
  | 'error'
  | 'failed';

export interface ServiceHealth {
  id: string;
  name: string;
  status: ServiceStatus;
  service: Service;
}