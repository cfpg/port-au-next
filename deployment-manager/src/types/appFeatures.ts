export enum AppFeature {
  PREVIEW_BRANCHES = 'preview_branches'
}

export const APP_FEATURES = {
  [AppFeature.PREVIEW_BRANCHES]: {
    name: 'Preview Branches',
    description: 'Enable preview deployments for feature branches with separate databases and subdomains',
    enabled: false
  }
} as const;

export type AppFeatureConfig = {
  enabled: boolean;
  config?: Record<string, any>;
}; 