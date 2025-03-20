import pool from "~/services/database";
import { DeploymentLog } from "~/types";

export default async function fetchLogs(appName: string, deploymentId: number) {
  const logs = await pool.query<DeploymentLog>(`
    SELECT d.id 
      FROM deployments d
      JOIN apps a ON a.id = d.app_id
      WHERE a.name = $1 AND d.id = $2
  `, [appName, deploymentId]);

  return logs.rows;
}