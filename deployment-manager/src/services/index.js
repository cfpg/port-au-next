const database = require('./database');
const docker = require('./docker');
const git = require('./git');
const nginx = require('./nginx');
const nextConfig = require('./nextConfig');

module.exports = {
  database,
  docker,
  git,
  nginx,
  nextConfig
}; 