
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

export async function modifyNextConfig(appDir: string) {
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
    await logger.debug('Original config content:', { content: configContent });

    // Parse the configuration while preserving the overall structure
    let modifiedContent = configContent;

    // First check for exported variable pattern
    const exportMatch = configContent.match(/export\s+default\s+(\w+)/);
    let configStartRegex: string | RegExp = "";
    let configStartReplacement;

    if (exportMatch) {
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

    // If we have new configurations to add and haven't modified the content yet
    if (configInsertions.length > 0 && modifiedContent === configContent) {
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
      modifiedContent
    });

  } catch (error) {
    await logger.error('Error modifying Next.js config', error as Error);
    throw error;
  }
}
