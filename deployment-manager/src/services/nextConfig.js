const fs = require('fs');
const path = require('path');
const logger = require('./logger');

async function detectConfigType(appDir) {
  const tsConfigPath = path.join(appDir, 'next.config.ts');
  const jsConfigPath = path.join(appDir, 'next.config.js');
  
  await logger.debug('Detecting Next.js config type', { appDir });
  
  if (fs.existsSync(tsConfigPath)) {
    await logger.debug('TypeScript config detected');
    return { path: tsConfigPath, type: 'typescript' };
  } else if (fs.existsSync(jsConfigPath)) {
    await logger.debug('JavaScript config detected');
    return { path: jsConfigPath, type: 'javascript' };
  }
  
  await logger.debug('No existing Next.js config found');
  return null;
}

async function parseConfig(content) {
  // Remove comments and clean up the content
  const cleanContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  
  // Create a temporary function to safely evaluate the config
  const fn = new Function('require', 'module', 'exports', cleanContent);
  const mod = { exports: {} };
  
  // Execute in a safe context
  fn(() => ({}), mod, mod.exports);
  
  // Handle both module.exports and export default
  return mod.exports.default || mod.exports;
}

async function copyImageLoader(appDir, isTypescript) {
  const sharedDir = path.join(__dirname, '../../apps/shared');
  const sourceFile = isTypescript ? 'image-loader.ts' : 'image-loader.js';
  const targetDir = path.join(appDir, 'src/lib');
  
  try {
    await logger.debug('Copying image loader', { sourceFile, targetDir });
    
    if (!fs.existsSync(targetDir)) {
      await logger.debug('Creating target directory', { targetDir });
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    fs.copyFileSync(
      path.join(sharedDir, sourceFile),
      path.join(targetDir, sourceFile)
    );
    
    await logger.info('Image loader copied successfully', { sourceFile, targetDir });
  } catch (error) {
    await logger.error('Failed to copy image loader', error);
    throw error;
  }
}

async function validateSetup(appDir, isTypescript) {
  const ext = isTypescript ? 'ts' : 'js';
  const loaderPath = path.join(appDir, 'src/lib', `image-loader.${ext}`);
  const configPath = path.join(appDir, `next.config.${ext}`);
  
  await logger.debug('Validating Next.js setup', { loaderPath, configPath });
  
  if (!fs.existsSync(loaderPath)) {
    await logger.error('Image loader not found', { path: loaderPath });
    throw new Error(`Image loader not found at ${loaderPath}`);
  }
  
  if (!fs.existsSync(configPath)) {
    await logger.error('Next.js config not found', { path: configPath });
    throw new Error(`Next.js config not found at ${configPath}`);
  }
  
  const configContent = fs.readFileSync(configPath, 'utf8');
  if (!configContent.includes('loader: \'custom\'') || 
      !configContent.includes('output: \'standalone\'')) {
    await logger.error('Next.js config missing required settings', { configPath });
    throw new Error('Next.js config is missing required settings');
  }
  
  await logger.info('Next.js setup validated successfully');
}

async function ensureNextConfig(appDir) {
  try {
    await logger.info('Ensuring Next.js configuration', { appDir });
    
    const configInfo = await detectConfigType(appDir);
    let config = {
      output: 'standalone',
      headers: async () => {
        if (process.env.NODE_ENV !== 'production') {
          return [];
        }
        return [
          {
            source: '/:all*(gif|svg|jpg|jpeg|png|woff|woff2)',
            locale: false,
            headers: [
              {
                key: 'Cache-Control',
                value: 'public, max-age=31536000',
              }
            ],
          }
        ];
      }
    };

    if (configInfo) {
      await logger.debug('Reading existing config', { path: configInfo.path });
      const content = fs.readFileSync(configInfo.path, 'utf8');
      const existingConfig = await parseConfig(content);
      config = await mergeConfigs(existingConfig, config);
      await logger.info('Merged existing config with defaults');
    }

    const isTypescript = configInfo?.type === 'typescript';
    await copyImageLoader(appDir, isTypescript);

    config.images = {
      loader: 'custom',
      loaderFile: `./src/lib/image-loader.${isTypescript ? 'ts' : 'js'}`,
    };

    const configContent = generateConfigContent(config, isTypescript);
    const configPath = configInfo?.path || path.join(appDir, 'next.config.js');
    
    await logger.debug('Writing Next.js config', { path: configPath });
    fs.writeFileSync(configPath, configContent);
    
    await validateSetup(appDir, isTypescript);
    await logger.info('Next.js configuration completed successfully');
    
  } catch (error) {
    await logger.error('Failed to ensure Next.js configuration', error);
    throw error;
  }
}

function generateConfigContent(config, isTypescript) {
  const configString = JSON.stringify(config, (key, value) => {
    if (typeof value === 'function') {
      return value.toString();
    }
    return value;
  }, 2);

  // Convert JSON string back to valid JS/TS code
  const content = configString
    .replace(/"(async\s+)?function\s*\((.*?)\)\s*{([\s\S]*?)}"/g, '$1function($2){$3}')
    .replace(/"(\w+)":/g, '$1:');

  return isTypescript
    ? `import { NextConfig } from 'next';\n\nconst config: NextConfig = ${content};\n\nexport default config;`
    : `module.exports = ${content};`;
}

async function mergeConfigs(existing, defaults) {
  return {
    ...defaults,
    ...existing,
    // Ensure our required settings aren't overridden
    output: 'standalone',
  };
}

module.exports = {
  ensureNextConfig
}; 