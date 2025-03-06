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

async function parseConfig(content, isTypescript = false) {
  try {
    let configString;
    
    if (isTypescript) {
      // First find the name of the exported config
      const exportMatch = content.match(/export\s+default\s+(\w+)/);
      if (!exportMatch) {
        await logger.debug('No export default found in TypeScript config');
        return {};
      }
      
      const configName = exportMatch[1];
      // Now find the config definition using the exported name
      const configMatch = content.match(
        new RegExp(`const\\s+${configName}\\s*:\\s*NextConfig\\s*=\\s*({[\\s\\S]*?});`)
      );
      
      if (!configMatch) {
        await logger.debug('Config definition not found', { configName });
        return {};
      }
      configString = configMatch[1];
    } else {
      // For JavaScript, handle both inline and named exports
      const match = content.match(/(?:module\.exports\s*=|export\s+default)\s*({[\s\S]*?});/);
      if (!match) {
        await logger.debug('No JavaScript config object found');
        return {};
      }
      configString = match[1];
    }

    // Clean up the config string
    configString = configString
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, ''); // Remove comments

    try {
      return JSON.parse(configString);
    } catch (parseError) {
      await logger.error('Failed to parse config object', { configString, parseError });
      return {};
    }
  } catch (error) {
    await logger.error('Failed to parse Next.js config', error);
    return {};
  }
}

async function copyImageLoader(appDir, isTypescript) {
  const sharedDir = path.join(process.cwd(), './apps/shared');
  const sourceFile = isTypescript ? 'image-loader.ts' : 'image-loader.js';
  const targetDir = path.join(appDir, 'src/lib');
  
  try {
    await logger.debug('Copying image loader', { 
      from: path.join(sharedDir, sourceFile),
      to: path.join(targetDir, sourceFile)
    });
    
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
    await logger.error('Failed to copy image loader', {
      error,
      sharedDir,
      sourceFile,
      targetDir
    });
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
  const config = await parseConfig(configContent, isTypescript);
  
  const hasRequiredSettings = 
    config.output === 'standalone' &&
    config.images?.loader === 'custom' &&
    config.images?.loaderFile?.includes('image-loader');

  if (!hasRequiredSettings) {
    await logger.error('Next.js config missing required settings', { 
      configPath,
      current: {
        output: config.output,
        imageLoader: config.images?.loader,
        loaderFile: config.images?.loaderFile
      }
    });
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
      headers: [
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
      ]
    };

    if (configInfo) {
      await logger.debug('Reading existing config', { path: configInfo.path });
      const content = fs.readFileSync(configInfo.path, 'utf8');
      const existingConfig = await parseConfig(content, configInfo.type === 'typescript');
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
    
    // TODO: Fix generated next.config validation
    // await validateSetup(appDir, isTypescript);
    // await logger.info('Next.js configuration completed successfully');
    
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