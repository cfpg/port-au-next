export interface FileLogResponse {
  deploymentId: number;
  appName: string;
  path: string;
  sizeBytes: number;
  truncated: boolean;
  content: string;
}
