import pool from "~/services/database";
import { DeploymentLog } from "~/types";

export default async function fetchLogs(appName: string, deploymentId: number) {
  const existingDeployment = await pool.query<{id: number}>(`
    SELECT d.id 
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

  return logs.rows;
}