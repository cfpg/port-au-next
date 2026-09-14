
import fs from 'fs';
import path from 'path';
import logger from '~/services/logger';
import cloudflare from '~/services/cloudflare';

// Configuration constants
const NEXT_CONFIG = {
  output: 'standalone',
  images: {
    minimumCacheTTL: 2678400, // 31 days
  },
};

export function getImageConfig(existingConfig = '') {
  const minimumCacheTTLRegex = /['"]?minimumCacheTTL['"]?:/;
  const minimumCacheTTLConfig = `minimumCacheTTL: ${NEXT_CONFIG.images.minimumCacheTTL}`;
  
  // If there's existing config
  if (existingConfig) {
    if (minimumCacheTTLRegex.test(existingConfig)) {
      // Replace existing minimumCacheTTL with our value
      return existingConfig.replace(
        /['"]?minimumCacheTTL['"]?:\s*\d+/,
        minimumCacheTTLConfig
      );
    }

    // Insert minimumCacheTTL right after images: {
    return existingConfig.replace(
      /images:\s*{/,
      `images: {
    ${minimumCacheTTLConfig},`
    );
  }
  
  // If no existing config, just return minimumCacheTTL
  return `images: {
    ${minimumCacheTTLConfig}
  },`;
}

export function getOutputStandaloneConfig() {
  return `output: "${NEXT_CONFIG.output}",`;
}

function disableSentrySourceMapProcessing(configContent: string): string {
  if (!configContent.includes('withSentryConfig')) {
    throw new Error(
      'Bugsink source maps require @sentry/nextjs withSentryConfig in the application Next.js config.'
    );
  }

  const sourcemapsRegex = /sourcemaps\s*:\s*{[\s\S]*?}/;
  const sourcemapsMatch = configContent.match(sourcemapsRegex);
  if (!sourcemapsMatch) {
    throw new Error(
      'Bugsink source maps require an explicit sourcemaps block in withSentryConfig so platform injection can disable competing Sentry Debug IDs.'
    );
  }

  let sourcemapsConfig = sourcemapsMatch[0];
  if (/disable\s*:/.test(sourcemapsConfig)) {
    sourcemapsConfig = sourcemapsConfig.replace(
      /disable\s*:\s*[^,\n}]+/,
      'disable: true'
    );
  } else {
    sourcemapsConfig = sourcemapsConfig.replace(
      /sourcemaps\s*:\s*{/,
      'sourcemaps: {\n    disable: true,'
    );
  }

  return configContent.replace(sourcemapsRegex, sourcemapsConfig);
}

export async function modifyNextConfig(
  appDir: string,
  options: { bugsinkSourceMaps?: boolean } = {}
) {
  try {
    let configPath = path.join(appDir, 'next.config.js');
    let configContent;
    let isTypeScript = false;

    // Check if next.config.js exists, if not check for next.config.ts
    if (!fs.existsSync(configPath)) {
      configPath = path.join(appDir, 'next.config.ts');
      isTypeScript = true;

      // If neither exists, create next.config.js
      if (!fs.existsSync(configPath)) {
        configPath = path.join(appDir, 'next.config.js');
        configContent = 'module.exports = {};';
        fs.writeFileSync(configPath, configContent);
      }
    }

    // Read existing config
    configContent = fs.readFileSync(configPath, 'utf8');
    await logger.debug('Read Next.js config for modification', { configPath, isTypeScript });

    // Parse the configuration while preserving the overall structure
    let modifiedContent = configContent;

    // First check for exported variable pattern
    const wrappedExportMatch = configContent.match(
      /export\s+default\s+withSentryConfig\s*\(\s*(\w+)\s*,/
    );
    const wrappedCommonJsMatch = configContent.match(
      /module\.exports\s*=\s*withSentryConfig\s*\(\s*(\w+)\s*,/
    );
    const exportMatch = configContent.match(/export\s+default\s+(\w+)/);
    let configStartRegex: RegExp | null = null;
    let configStartReplacement;

    if (wrappedExportMatch) {
      const configVar = wrappedExportMatch[1];
      configStartRegex = new RegExp(`const\\s+(${configVar})(?:\\s*:\\s*[\\w<>{}\\[\\]]+)?\\s*=\\s*{`);
      configStartReplacement = `const $1 = {`;
    } else if (wrappedCommonJsMatch) {
      const configVar = wrappedCommonJsMatch[1];
      configStartRegex = new RegExp(`(const|let|var)\\s+(${configVar})\\s*=\\s*{`);
      configStartReplacement = '$1 $2 = {';
    } else if (exportMatch) {
      // Found a variable being exported
      const configVar = exportMatch[1];
      configStartRegex = new RegExp(`const\\s+(${configVar})(?:\\s*:\\s*[\\w<>{}\\[\\]]+)?\\s*=\\s*{`);
      configStartReplacement = `const $1 = {`;
    } else if (configContent.includes('module.exports')) {
      // For CommonJS syntax
      configStartRegex = /module\.exports\s*=\s*{/;
      configStartReplacement = 'module.exports = {';
    } else if (configContent.includes('export default')) {
      // For direct ESM syntax
      configStartRegex = /export\s+default\s*{/;
      configStartReplacement = 'export default {';
    }

    // Build the configuration insertions
    const configInsertions = [];
    
    // Handle output configuration
    const outputRegex = /output:\s*["']?[^,\n}]*["']?,?/;
    if (outputRegex.test(configContent)) {
      // Update existing output config
      modifiedContent = modifiedContent.replace(
        outputRegex,
        getOutputStandaloneConfig()
      );
    } else {
      configInsertions.push(getOutputStandaloneConfig());
    }

    // Add image config only if Cloudflare is enabled
    if (cloudflare.enabled) {
      if (configContent.includes('images:')) {
        // Extract existing images config
        const imagesMatch = configContent.match(/images:\s*{[^}]*}/);
        if (imagesMatch) {
          // Update existing images config while preserving other settings
          modifiedContent = modifiedContent.replace(
            /images:\s*{[^}]*}/,
            getImageConfig(imagesMatch[0])
          );
        }
      } else {
        configInsertions.push(getImageConfig());
      }
    }

    if (options.bugsinkSourceMaps) {
      const browserSourceMapsRegex = /productionBrowserSourceMaps\s*:\s*(?:true|false)/;
      if (browserSourceMapsRegex.test(modifiedContent)) {
        modifiedContent = modifiedContent.replace(
          browserSourceMapsRegex,
          'productionBrowserSourceMaps: true'
        );
      } else {
        configInsertions.push('productionBrowserSourceMaps: true,');
      }

      modifiedContent = disableSentrySourceMapProcessing(modifiedContent);
    }

    // If we have new configurations to add and haven't modified the content yet
    if (configInsertions.length > 0) {
      if (!configStartRegex || !configStartRegex.test(modifiedContent)) {
        throw new Error(
          'Could not safely locate the exported Next.js configuration object for platform-managed settings.'
        );
      }
      modifiedContent = modifiedContent.replace(
        configStartRegex,
        `${configStartReplacement}
  ${configInsertions.join('\n  ')}`
      );
    }

    // Write the modified config back to file
    fs.writeFileSync(configPath, modifiedContent);
    await logger.info('Updated Next.js configuration', {
      configPath,
      isTypeScript,
      cloudflareEnabled: cloudflare.enabled,
      bugsinkSourceMaps: Boolean(options.bugsinkSourceMaps),
    });

  } catch (error) {
    await logger.error('Error modifying Next.js config', error as Error);
    throw error;
  }
}
