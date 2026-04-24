export type JobRow = {
  id: string;
  app_id: number;
  name: string;
  cron_expression: string;
  timezone: string;
  enabled: boolean;
  http_method: string;
  url: string;
  headers_json: unknown | null;
  body: string | null;
  webhook_secret: string | null;
  deleted_at: Date | null;
  last_fired_scheduled_for: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type JobRunRow = {
  id: string;
  job_id: string;
  app_id: number;
  scheduled_for: Date;
  started_at: Date | null;
  finished_at: Date | null;
  status: string;
  http_status: number | null;
  error_message: string | null;
  response_headers_json: unknown | null;
  response_body: string | null;
};
