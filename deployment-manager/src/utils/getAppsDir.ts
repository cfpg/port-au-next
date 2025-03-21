import path from "path";

export default function getAppsDir() {
  return process.env.APPS_DIR || path.join(process.cwd(), '..', 'apps');
}