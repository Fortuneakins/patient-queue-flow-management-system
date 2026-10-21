const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const compose = read('compose.production.yml');
const nginx = read('frontend/nginx.conf');
const caddy = read('Caddyfile');
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
assert.match(nginx, /proxy_pass http:\/\/analytics:5001\s*;/, 'Nginx analytics upstream must match the Compose analytics port');
assert.match(analytics, /\bexpose:\s*\n\s*- ["']?5001["']?/, 'Compose analytics must expose port 5001 internally');

for (const [name, block] of [['api', api], ['analytics', analytics], ['web', web], ['migrate', migrate]]) {
  assert.doesNotMatch(block, /^\s*ports:/m, 'Only Caddy may publish host ports; "' + name + '" must remain private');
}
assert.match(caddyService, /\bports:/, 'The public gateway must publish ports');
assert.match(caddyService, /- ["']?80:80["']?/, 'The public gateway must publish HTTP port 80');
assert.match(caddyService, /- ["']?443:443["']?/, 'The public gateway must publish HTTPS port 443');
assert.match(api, /DATA_PROVENANCE_MODE:\s*OPERATIONAL/, 'Production API must use operational provenance');
assert.match(analytics, /DATA_PROVENANCE_MODE:\s*OPERATIONAL/, 'Production analytics must use operational provenance');
assert.match(migrate, /npm run db:migrate/, 'The migration service must run only the tracked migration runner');

console.log('Production topology checks passed: Caddy → Nginx 8080 → private API 5000 / analytics 5001; only Caddy publishes host ports.');
