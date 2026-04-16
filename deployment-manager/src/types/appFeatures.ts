export enum AppFeature {
  PREVIEW_BRANCHES = 'preview_branches',
  USES_PRISMA = 'uses_prisma'
}

export const APP_FEATURES = {
  [AppFeature.PREVIEW_BRANCHES]: {
    name: 'Preview Branches',
    description: 'Enable preview deployments for feature branches with separate databases and subdomains',
    enabled: false
  },
  [AppFeature.USES_PRISMA]: {
    name: 'Uses Prisma',
    description: 'Grants CREATEDB to the app database user, required for Prisma shadow database during migrations',
    enabled: false
  }
} as const;

export type AppFeatureConfig = {
  enabled: boolean;
  config?: Record<string, any>;
}; 