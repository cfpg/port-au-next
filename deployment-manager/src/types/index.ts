export interface Deployment {
  id: number;
  app_id: number;
  app_name: string;
  commit_id: string;
  version: string;
  status: string;
  container_id: string;
  deployed_at: Date;
} 