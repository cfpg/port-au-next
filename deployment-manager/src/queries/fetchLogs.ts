import pool from "~/services/database";
import { AppDeployment, DeploymentLog } from "~/types";

export default async function fetchLogs(appName: string, deploymentId: number): Promise<{app: AppDeployment; logs: DeploymentLog[]}> {
  const existingDeployment = await pool.query<{id: number; name: string; repo_url: string; branch: string; status: string; deployed_at: Date}>(`
    SELECT a.name, a.repo_url, a.branch, d.status, d.id, d.deployed_at
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE a.name = $1 AND d.id = $2
      LIMIT 1
  `, [appName, deploymentId]);

  if (!existingDeployment.rows[0]) {
    throw new Error("Deployment not found");
  }

  const logs = await pool.query<DeploymentLog>(`
    SELECT * FROM deployment_logs 
       WHERE deployment_id = $1 
       ORDER BY created_at ASC
  `, [deploymentId]);

  return {app: existingDeployment.rows[0], logs: logs.rows};
}