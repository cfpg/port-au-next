export interface Deployment {
  id: number;
  app_id: number;
  app_name: string;
  app_repository: string;
  version: string;
  commit_id: string;
  status: string;
  deployed_at: Date;
  container_id?: string;
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
  env: Record<string, string>;
  status: string;
  last_deployment?: {
    version: string;
    commit_id: string;
    status: string;
    deployed_at: Date;
  };
}

export interface AppSettings {
  name: string;
  repo_url: string;
  branch: string;
  domain?: string;
  cloudflare_zone_id?: string;
} 
