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
  status: string;
  last_deployment?: {
    version: string;
    commit_id: string;
    status: string;
    deployed_at: Date;
  };
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
} 


export type Service = 'nginx' | 'postgres' | 'redis' | 'thumbor' | 'minio';
export type ServiceStatus = 'running' | 'stopped' | 'unknown' | 'pending' | 'building' | 'error' | 'failed';

export interface ServiceHealth {
  id: string;
  name: string;
  status: ServiceStatus;
  service: Service;
}