/**
 * InsureCo Platform API + Dashboard
 * A minimal insurance SaaS backend that serves as the
 * "target application" governed by Sentinel-Ops.
 */

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataStore } from './data/seed.js';
import { ClaimsBot } from './agents/claims-bot/index.js';
import { UnderwriteAI } from './agents/underwrite-ai/index.js';
import { FraudHunter } from './agents/fraud-hunter/index.js';
import { PolicyAdvisor } from './agents/policy-advisor/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DASHBOARD_DIR = resolve(__dirname, '..', 'dashboard');
const PORT = process.env.PORT || 4000;
const store = new DataStore();

// Initialize agents
const claimsBot = new ClaimsBot(store);
const underwriteAI = new UnderwriteAI(store);
const fraudHunter = new FraudHunter(store);
const policyAdvisor = new PolicyAdvisor(store);

export { store };

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function serveStatic(res, filePath) {
  try {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

// ── Demo scenario runner ─────────────────────────────────────────
async function runDemoScenario(scenario) {
  const { endpoint, params } = scenario;

  switch (endpoint) {
    case 'claim': {
      const result = await claimsBot.processClaim(params.claimId);
      return {
        decision: result.decision?.action || result.status,
        toolName: 'Write',
        path: `data/claims/${params.claimId}`,
        reason: result.decision?.reason || result.reason || '',
        detail: result,
      };
    }
    case 'score': {
      const result = await underwriteAI.scoreCustomer(params.customerId, params.policyType);
      return {
        decision: result.status === 'scored' ? 'allow' : result.status,
        toolName: 'Write',
        path: `data/risk-assessments/${params.customerId}-${params.policyType}`,
        reason: result.scoring?.explanation || result.reason || '',
        detail: result,
      };
    }
    case 'fraud': {
      const result = await fraudHunter.analyzeClaim(params.claimId);
      return {
        decision: result.status === 'analyzed' ? 'allow' : result.status,
        toolName: 'Read',
        path: `data/claims/${params.claimId}`,
        reason: result.analysis?.recommendation || result.reason || '',
        detail: result,
      };
    }
    case 'advise': {
      const result = await policyAdvisor.answerQuestion(params.customerId, params.question);
      return {
        decision: result.status === 'answered' ? 'allow' : result.status,
        toolName: 'Read',
        path: `data/policies?customerId=${params.customerId}`,
        reason: result.response?.answer?.substring(0, 120) || result.reason || '',
        detail: result,
      };
    }
    case 'protected': {
      const agent = params.agentId === 'underwrite-ai' ? underwriteAI : claimsBot;
      const result = params.agentId === 'underwrite-ai'
        ? await agent.attemptAccessProtectedData(params.customerId)
        : await agent.attemptReadProtectedData(params.customerId);
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Read',
        path: `data/customers/${params.customerId}/protected`,
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    case 'cross-tenant': {
      const result = await fraudHunter.attemptCrossTenantAccess('OTHER-CUST-999');
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Read',
        path: 'tenants/other-corp/data/customers/OTHER-CUST-999',
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    case 'modify-claim': {
      const result = await fraudHunter.attemptModifyClaim(params.claimId);
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Write',
        path: `data/claims/${params.claimId}`,
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    case 'write-policy': {
      const result = await policyAdvisor.attemptWritePolicy(params.policyId, { premium: 100 });
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Write',
        path: `data/policies/${params.policyId}`,
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    case 'read-claims': {
      const result = await policyAdvisor.attemptReadClaims(params.customerId);
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Read',
        path: `data/claims?customerId=${params.customerId}`,
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    case 'bash': {
      const result = await policyAdvisor.attemptBashCommand(params.command);
      return {
        decision: result.evaluation?.decision || 'deny',
        toolName: 'Bash',
        path: params.command,
        reason: result.evaluation?.reason || '',
        detail: result,
      };
    }
    default:
      return { decision: 'error', reason: `Unknown endpoint: ${endpoint}` };
  }
}

// ── HTTP Server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method;

  // ── Health ─────────────────────────────────────────
  if (path === '/health') {
    return json(res, 200, { status: 'ok', service: 'insureco-platform' });
  }

  // ── Demo scenario API ──────────────────────────────
  if (method === 'POST' && path === '/api/demo/scenario') {
    const body = await parseBody(req);
    const result = await runDemoScenario(body);
    return json(res, 200, result);
  }

  // ── Customers ──────────────────────────────────────
  if (method === 'GET' && path.startsWith('/api/customers/')) {
    const id = path.split('/')[3];
    const safe = url.searchParams.get('fields') === 'protected'
      ? store.getCustomerProtected(id)
      : store.getCustomerSafe(id);
    return safe ? json(res, 200, safe) : json(res, 404, { error: 'Customer not found' });
  }

  if (method === 'GET' && path === '/api/customers') {
    const all = [...store.customers.values()].map(({ protected: _p, ...c }) => c);
    return json(res, 200, all);
  }

  // ── Policies ───────────────────────────────────────
  if (method === 'GET' && path.startsWith('/api/policies/')) {
    const id = path.split('/')[3];
    const p = store.getPolicy(id);
    return p ? json(res, 200, p) : json(res, 404, { error: 'Policy not found' });
  }

  if (method === 'GET' && path === '/api/policies') {
    return json(res, 200, [...store.policies.values()]);
  }

  // ── Claims ─────────────────────────────────────────
  if (method === 'GET' && path.startsWith('/api/claims/')) {
    const id = path.split('/')[3];
    const c = store.getClaim(id);
    return c ? json(res, 200, c) : json(res, 404, { error: 'Claim not found' });
  }

  if (method === 'GET' && path === '/api/claims') {
    const customerId = url.searchParams.get('customerId');
    const policyId = url.searchParams.get('policyId');
    let claims;
    if (customerId) claims = store.getClaimsForCustomer(customerId);
    else if (policyId) claims = store.getClaimsForPolicy(policyId);
    else claims = [...store.claims.values()];
    return json(res, 200, claims);
  }

  if (method === 'PATCH' && path.startsWith('/api/claims/')) {
    const id = path.split('/')[3];
    const body = await parseBody(req);
    const updated = store.updateClaim(id, body);
    return updated ? json(res, 200, updated) : json(res, 404, { error: 'Claim not found' });
  }

  // ── Audit log ──────────────────────────────────────
  if (method === 'GET' && path === '/api/audit') {
    return json(res, 200, store.auditLog);
  }

  // ── Dashboard (static files) ───────────────────────
  if (method === 'GET') {
    const filePath = path === '/' || path === '/dashboard'
      ? resolve(DASHBOARD_DIR, 'index.html')
      : resolve(DASHBOARD_DIR, path.replace(/^\//, ''));

    if (serveStatic(res, filePath)) return;
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`InsureCo Platform running on http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}/`);
  console.log(`  API:       http://localhost:${PORT}/api/`);
  console.log(`  ${store.customers.size} customers, ${store.policies.size} policies, ${store.claims.size} claims loaded`);
});
