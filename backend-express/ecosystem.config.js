// PM2 Process Manager Configuration for VPS Deployments
module.exports = {
  apps: [
    {
      name: 'erp-backend-express',
      script: './server.js',
      instances: 'max', // or 2-4 based on CPU cores
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 8001,
      },
    },
  ],
};
