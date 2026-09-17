export enum AppFeature {
  PREVIEW_BRANCHES = 'preview_branches',
  USES_PRISMA = 'uses_prisma',
  AUTO_DEPLOY = 'auto_deploy'
}

export const APP_FEATURES = {
  [AppFeature.PREVIEW_BRANCHES]: {
    name: 'Preview Branches',
    description: 'Enable preview deployments for feature branches with separate databases and subdomains',
    enabled: false
  },
  [AppFeature.USES_PRISMA]: {
    name: 'Uses Prisma',
    description:
      'Grants CREATEDB, platform Prisma Dockerfile, and optional auto-migrate on deploy (config.auto_migrate)',
    enabled: false
  },
  [AppFeature.AUTO_DEPLOY]: {
    name: 'Auto-deploy',
    description:
      'Queue a deployment automatically from GitHub: a push to the production branch deploys normally, ' +
      'and an open pull request deploys as a preview (requires Preview Branches enabled with a preview ' +
      'domain configured). Closing the PR destroys that preview. Requires GitHub already connected for this app.',
    enabled: false
  }
} as const;

export type AppFeatureConfig = {
  enabled: boolean;
  config?: Record<string, any>;
}; 