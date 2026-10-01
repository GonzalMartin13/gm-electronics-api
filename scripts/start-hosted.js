// Free hosting does not provide a separate pre-deploy command.
// Both steps are idempotent and finish before the HTTP server starts.
await import('./migrate.js');
if(process.exitCode)process.exit(process.exitCode);
await import('./load-seed.js');
if(process.exitCode)process.exit(process.exitCode);
await import('../src/server.js');
await import('./verify-deployed.js');

