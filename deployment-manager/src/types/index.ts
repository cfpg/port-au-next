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
