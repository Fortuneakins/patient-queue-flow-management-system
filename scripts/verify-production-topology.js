const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const compose = read('compose.production.yml');
const nginx = read('frontend/nginx.conf');
const caddy = read('Caddyfile');
const analyticsApp = read('analytics_service/app.py');
const analyticsRoutes = read('backend/src/routes/analytics.routes.js');
const analyticsProxy = read('backend/src/services/analyticsProxyService.js');
const apiApp = read('backend/src/app.js');
const frontendApi = read('frontend/src/services/api.js');
const frontendDockerfile = read('frontend/Dockerfile');
const envExample = read('.env.example');
const frontendEnvExample = read('frontend/.env.example');
const setupScript = read('scripts/setup.ps1');
const lines = compose.split(/\r?\n/);

function serviceBlock(name) {
  const start = lines.indexOf('  ' + name + ':');
  assert.notEqual(start, -1, 'Compose service "' + name + '" must exist');
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^(  [A-Za-z0-9_-]+:|networks:|volumes:)$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

const api = serviceBlock('api');
const analytics = serviceBlock('analytics');
const web = serviceBlock('web');
const caddyService = serviceBlock('caddy');
const migrate = serviceBlock('migrate');

assert.match(nginx, /^\s*listen 8080;$/m, 'Nginx must listen on port 8080');
assert.match(caddy, /^\s*reverse_proxy web:8080\s*$/m, 'Caddy must proxy to Nginx port 8080');
assert.match(web, /\bexpose:\s*\n\s*- ["']?8080["']?/, 'Compose must expose Nginx port 8080 internally');
assert.match(nginx, /proxy_pass http:\/\/api:5000\/api\//, 'Nginx API upstream must match the Compose API port');
assert.match(api, /\bexpose:\s*\n\s*- ["']?5000["']?/, 'Compose API must expose port 5000 internally');
assert.doesNotMatch(nginx, /location\s+\/analytics\//, 'Nginx must not expose the Flask analytics service directly');
assert.doesNotMatch(nginx, /proxy_pass\s+http:\/\/analytics:5001/, 'Public frontend proxy must not bypass Express for analytics');
assert.match(analytics, /\bexpose:\s*\n\s*- ["']?5001["']?/, 'Compose analytics must expose port 5001 internally to the private network');
assert.match(apiApp, /app\.use\('\/api\/analytics',\s*analyticsRoutes\)/, 'Express must mount the analytics proxy routes');
assert.match(analyticsRoutes, /router\.get\('\/predict'/, 'Express must provide the public aggregate estimate route');
assert.match(analyticsRoutes, /router\.get\('\/model',\s*authenticate,\s*requireReadyPassword,\s*authorizeRoles\('ADMIN'\)/, 'Detailed model evidence must be administrator-only');
assert.match(analyticsProxy, /X-Internal-Service-Token/, 'The internal analytics proxy must authenticate service-to-service requests');
assert.match(analyticsApp, /hmac\.compare_digest/, 'The Flask prediction endpoint must validate its internal service token');
assert.match(frontendApi, /request\('\/api\/analytics\/predict'\)/, 'The browser must consume predictions through same-origin Express');
assert.doesNotMatch(frontendApi, /ANALYTICS_BASE_URL|localhost:5001/, 'Browser code must not embed the private analytics URL');
assert.doesNotMatch(frontendDockerfile, /VITE_ANALYTICS_BASE_URL/, 'Frontend build must not embed an analytics origin');
assert.doesNotMatch(envExample, /VITE_ANALYTICS_BASE_URL/, 'Environment template must not publish an analytics browser origin');
assert.doesNotMatch(frontendEnvExample, /VITE_ANALYTICS_BASE_URL/, 'Frontend template must not publish an analytics browser origin');
assert.doesNotMatch(setupScript, /^VITE_ANALYTICS_BASE_URL=/m, 'Setup script must not provision direct browser analytics access');
assert.doesNotMatch(web, /VITE_ANALYTICS_BASE_URL/, 'Production build args must not contain the private analytics route');

for (const [name, block] of [['api', api], ['analytics', analytics], ['web', web], ['migrate', migrate]]) {
  assert.doesNotMatch(block, /^\s*ports:/m, 'Only Caddy may publish host ports; "' + name + '" must remain private');
}
assert.match(caddyService, /\bports:/, 'The public gateway must publish ports');
assert.match(caddyService, /- ["']?80:80["']?/, 'The public gateway must publish HTTP port 80');
assert.match(caddyService, /- ["']?443:443["']?/, 'The public gateway must publish HTTPS port 443');
assert.match(api, /DATA_PROVENANCE_MODE:\s*OPERATIONAL/, 'Production API must use operational provenance');
assert.match(analytics, /DATA_PROVENANCE_MODE:\s*OPERATIONAL/, 'Production analytics must use operational provenance');
assert.match(migrate, /command:\s*\["npm",\s*"run",\s*"db:migrate"\]/, 'The migration service must run only the tracked migration runner');

console.log('Production topology checks passed: Caddy → Nginx → Express API → token-protected private analytics; only Caddy publishes host ports.');
