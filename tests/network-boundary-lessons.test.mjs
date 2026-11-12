import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  architectureCourse,
  architectureLearner,
  architectureEnrollment,
  enrollmentResponse,
} from '../assets/architecture-lesson-fixtures.mjs';

const gatewayText = await readFile(new URL('../docs/lessons/GATEWAYS-BFFS-AND-LOAD-BALANCING.md', import.meta.url), 'utf8');
const meshText = await readFile(new URL('../docs/lessons/SERVICE-MESH-AND-TRUST.md', import.meta.url), 'utf8');
const original = await readFile(new URL('../docs/06-API-ARCHITECTURE.md', import.meta.url), 'utf8');
const contract = JSON.parse(await readFile(new URL('../docs/contracts/course_api.openapi.json', import.meta.url), 'utf8'));

function example(text, label) {
  const marker = `<!-- example: ${label} -->`;
  assert.equal(text.split(marker).length, 2, `one ${label} example`);
  const after = text.split(marker)[1];
  const match = after.match(/^\s*```json\s*\n([\s\S]*?)\n```/);
  assert.ok(match, `${label} must be a labeled JSON block`);
  return JSON.parse(match[1]);
}

const routes = example(gatewayText, 'gateway-route-policy');
const views = example(gatewayText, 'frontend-views');
const degraded = example(gatewayText, 'degraded-mobile-view');
const trust = example(meshText, 'trust-context');
const retryBudget = example(meshText, 'retry-budget');
const canary = example(meshText, 'canary-policy');

// Deliberately small teaching models, not proxy or authentication implementations.
function route(policy, method, path) {
  return policy.routes.find((entry) => entry.method === method && entry.path === path)?.target ?? null;
}

function edgeIdentity(policy, clientHeader, verifiedSubject) {
  if (!policy.stripClientIdentityHeader || !policy.authenticateBeforeForward || !policy.trustedHopRequired) {
    throw new Error('insecure teaching policy');
  }
  void clientHeader;
  return verifiedSubject ? { status: 200, forwardedUser: verifiedSubject } : { status: 401 };
}

function authorization(context) {
  const d = context.delegation;
  if (!context.workloadAuthenticated || !d || !d.subject || !d.signatureValid || !d.issuerValid || !d.notExpired || d.audience !== 'enrollment') return null;
  if (!context.objectAuthorization || context.requestedCourse !== 'course-101') return null;
  return d.subject;
}

function readyChoice(backends) {
  return backends.find((backend) => backend.readiness === true)?.name ?? null;
}

function leastConnections(backends) {
  return backends.reduce((best, backend) => backend.connections < best.connections ? backend : best).name;
}

function canaryVersion(policy, bucket) {
  if (!Number.isInteger(bucket) || bucket < 0 || bucket >= 100) throw new RangeError('bucket');
  return bucket < policy.canaryPercent ? 'canary' : 'stable';
}

test('labeled examples agree with shared course fixtures and OpenAPI', () => {
  assert.deepEqual(architectureCourse, { id: 'course-101', title: 'API Fundamentals', seats: 29 });
  assert.equal(architectureLearner, 'learner-7');
  assert.equal(architectureEnrollment, 'enrollment-42');
  assert.deepEqual(degraded.course, architectureCourse);
  assert.deepEqual(degraded.enrollment, enrollmentResponse);
  assert.deepEqual(degraded.recommendations, { status: 'unavailable', items: null });
  assert.equal(contract.openapi, '3.1.0');
  const post = contract.paths['/courses/{courseId}/enrollments'].post;
  assert.deepEqual(post.security, [{ sessionCookie: [] }]);
  assert.ok(post.parameters.some((p) => p.name === 'Idempotency-Key' && p.required));
  assert.equal(post.requestBody, undefined);
  assert.ok(post.responses['201'] && post.responses['409'] && post.responses['503']);
  assert.deepEqual(contract.components.securitySchemes.sessionCookie, { type: 'apiKey', in: 'cookie', name: 'session' });
});

test('mobile, web and dashboard are views of one course with different display caps', () => {
  assert.deepEqual(Object.keys(views).sort(), ['dashboard', 'mobile', 'web']);
  assert.deepEqual([views.mobile.recommendationLimit, views.web.recommendationLimit, views.dashboard.recommendationLimit], [5, 20, 10]);
  for (const view of Object.values(views)) {
    assert.equal(view.courseId, architectureCourse.id);
    assert.ok(view.fields.includes('enrollment'));
    assert.ok(view.fields.includes('recommendations'));
  }
  assert.ok(views.dashboard.fields.includes('summary'));
});

test('routing matches method and path, never sends unknown routes to a write', () => {
  assert.equal(route(routes, 'GET', '/courses/course-101'), 'course-read-v1');
  assert.equal(route(routes, 'POST', '/courses/course-101/enrollments'), 'enrollment-v1');
  assert.equal(route(routes, 'GET', '/courses/course-101/enrollments'), null);
  assert.equal(route(routes, 'POST', '/courses/course-102/enrollments'), null);
  assert.equal(route(routes, 'DELETE', '/courses/course-101'), null);
});

test('client header is stripped; identity requires verification and backend authorization', () => {
  assert.deepEqual(edgeIdentity(routes, 'learner-7', null), { status: 401 });
  assert.deepEqual(edgeIdentity(routes, 'learner-7', 'learner-8'), { status: 200, forwardedUser: 'learner-8' });
  assert.equal(authorization(trust), 'learner-7');
  for (const bad of [
    { ...trust, workloadAuthenticated: false },
    { ...trust, objectAuthorization: false },
    { ...trust, requestedCourse: 'course-102' },
    { ...trust, delegation: null },
    { ...trust, delegation: { ...trust.delegation, signatureValid: false } },
    { ...trust, delegation: { ...trust.delegation, issuerValid: false } },
    { ...trust, delegation: { ...trust.delegation, subject: '' } },
    { ...trust, delegation: { ...trust.delegation, notExpired: false } },
    { ...trust, delegation: { ...trust.delegation, audience: 'other' } },
  ]) assert.equal(authorization(bad), null);
});

test('L4 connection selection differs from L7 query-aware request selection', () => {
  const l4 = (connectionId) => ({ c1: 'A', c2: 'B' })[connectionId];
  const l7 = (url) => new URL(url, 'https://course.example').searchParams.get('view') === 'dashboard' ? 'dashboard' : 'mobile';
  assert.equal(l4('c1'), 'A');
  assert.equal(l4('c1'), 'A');
  assert.equal(l7('/courses/course-101?view=dashboard'), 'dashboard');
  assert.equal(l7('/courses/course-101?view=mobile'), 'mobile');
  assert.equal(l4('c2'), 'B');
});

test('least connections can select the busy HTTP/2 backend with many streams', () => {
  const backends = [
    { name: 'A', connections: 1, streams: 100 },
    { name: 'B', connections: 2, streams: 2 },
  ];
  assert.equal(leastConnections(backends), 'A');
  assert.ok(backends[0].streams > backends[1].streams);
  assert.equal(leastConnections([{ name: 'A', connections: 3 }, { name: 'B', connections: 1 }]), 'B');
});

test('equal or weighted request counts do not guarantee balanced work', () => {
  const roundRobin = ['A', 'B', 'A', 'B'];
  const costs = [1, 1, 99, 1];
  const work = roundRobin.reduce((totals, backend, i) => {
    totals[backend] += costs[i];
    return totals;
  }, { A: 0, B: 0 });
  assert.equal(roundRobin.filter((name) => name === 'A').length, 2);
  assert.equal(roundRobin.filter((name) => name === 'B').length, 2);
  assert.deepEqual(work, { A: 100, B: 2 });
  const weighted = ['A', 'A', 'B'];
  assert.deepEqual(weighted.map((name) => ({ A: 1, B: 100 })[name]), [1, 1, 100]);
});

test('IP affinity groups different users behind one NAT and cannot guarantee balance', () => {
  const destinationByIp = new Map([['203.0.113.8', 'A'], ['203.0.113.9', 'B']]);
  const clients = [
    { learner: 'learner-7', ip: '203.0.113.8' },
    { learner: 'learner-8', ip: '203.0.113.8' },
    { learner: 'learner-9', ip: '203.0.113.9' },
  ];
  assert.deepEqual(clients.map((client) => destinationByIp.get(client.ip)), ['A', 'A', 'B']);
});

test('consistent hashing moves some keys on membership change, not every key', () => {
  const ringChoice = (ring, key) => (ring.find((node) => node.point >= key) ?? ring[0]).name;
  const before = [{ point: 20, name: 'A' }, { point: 70, name: 'B' }];
  const after = [{ point: 20, name: 'A' }, { point: 50, name: 'C' }, { point: 70, name: 'B' }];
  const keys = [10, 30, 60, 90];
  const moved = keys.filter((key) => ringChoice(before, key) !== ringChoice(after, key));
  assert.deepEqual(moved, [30]);
  assert.ok(moved.length > 0 && moved.length < keys.length);
});

test('no ready backend is unavailable, including unknown readiness', () => {
  assert.equal(readyChoice([{ name: 'A', readiness: false }, { name: 'B', readiness: null }]), null);
  assert.equal(readyChoice([{ name: 'A', readiness: false }, { name: 'B', readiness: true }]), 'B');
  assert.equal(readyChoice([]), null);
});

test('retry attempt limits amplify while POST mesh retries are explicitly disabled', () => {
  assert.equal(retryBudget.clientTotalAttempts * retryBudget.gatewayTotalAttempts * retryBudget.meshTotalAttempts, 12);
  assert.equal(retryBudget.enrollmentPost.meshRetries, 0);
  assert.equal(retryBudget.overallDeadlineMs, 800);
  assert.ok(retryBudget.courseReadAttemptTimeoutMs < retryBudget.overallDeadlineMs);
});

test('canary buckets describe expected request selection, not an exact sample or stream migration', () => {
  assert.equal(canary.unit, 'http-request');
  assert.equal(canary.stablePercent + canary.canaryPercent, 100);
  assert.equal(canaryVersion(canary, 4), 'canary');
  assert.equal(canaryVersion(canary, 5), 'stable');
  assert.equal(Array.from({ length: 20 }, () => canaryVersion(canary, 50)).filter((v) => v === 'canary').length, 0);
  assert.equal(canary.stickyExistingStreams, true);
  const connections = [{ version: 'canary', streams: 100 }, { version: 'stable', streams: 1 }];
  assert.equal(connections.filter((c) => c.version === 'canary').length / connections.length, 0.5);
  assert.equal(connections[0].streams / connections.reduce((n, c) => n + c.streams, 0), 100 / 101);
  assert.throws(() => canaryVersion(canary, 100), RangeError);
});

test('lessons have bounded length, closed native answers, and original verified quotes', () => {
  for (const text of [gatewayText, meshText]) {
    const lines = text.trimEnd().split('\n').length;
    assert.ok(lines >= 350 && lines <= 450, `lesson contains ${lines} lines`);
    const opens = [...text.matchAll(/<details class="learning-answer">/g)].length;
    assert.ok(opens >= 4);
    assert.equal(opens, [...text.matchAll(/<\/details>/g)].length);
    assert.equal(opens, [...text.matchAll(/<summary>Show answer<\/summary>/g)].length);
    assert.doesNotMatch(text, /<details[^>]*\bopen\b/);
    for (const [, body] of text.matchAll(/<details class="learning-answer">([\s\S]*?)<\/details>/g)) {
      const content = body.replace(/^\s*<summary>Show answer<\/summary>/, '');
      const paragraphs = [...content.matchAll(/<p>((?:(?!<\/?p\b)[\s\S])*?)<\/p>/g)];
      assert.ok(paragraphs.length > 0);
      assert.ok(paragraphs.every(([, paragraph]) => paragraph.trim().length > 0));
      assert.equal(content.replace(/<p>((?:(?!<\/?p\b)[\s\S])*?)<\/p>/g, '').trim(), '');
      assert.doesNotMatch(body, /`|\*\*|__|\[[^\]]+\]\([^)]+\)/);
    }
    assert.doesNotMatch(text, /\]\([^)]*#/);
    assert.ok(text.includes('Text alternative:'));
    assert.ok(text.includes('../contracts/course_api.openapi.json'));
  }
  for (const quote of [
    'Instead of every service checking tokens.', 'Everything dies.', 'Perfect distribution.',
    'Least loaded.', 'Minimal movement.', 'Applications never talk directly.',
    'Istio  = Control Plane', 'All services get same behaviour.', 'Every request passes through Envoy.',
  ]) {
    assert.ok(original.split('\n').includes(quote), `exact original line: ${quote}`);
    assert.ok(gatewayText.includes(`“${quote}”`) || meshText.includes(`“${quote}”`));
  }
});
