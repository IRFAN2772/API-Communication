import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  architectureCourse, architectureLearner, architectureEnrollment,
  catalogueResponse, enrollmentResponse, stableObservation, requestCapacityModel,
} from '../assets/architecture-lesson-fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const guide = readFileSync(resolve(root, 'docs/06-GUIDED-ARCHITECTURE.md'), 'utf8');
const contract = JSON.parse(readFileSync(resolve(root, 'docs/contracts/course_api.openapi.json'), 'utf8'));
const steps = ['baseline', 'clients', 'balancing', 'edge', 'contract', 'capacity', 'next'];
const section = (name) => {
  const start = guide.indexOf(`<span id="arch-${name}"></span>`);
  assert.notEqual(start, -1, `missing ${name} anchor`);
  const end = guide.indexOf('<span id="arch-', start + 1);
  return guide.slice(start, end === -1 ? undefined : end);
};
const jsonBlocks = (text) => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));

// This checks the schema features used by the selected bodies, not all of JSON Schema.
function assertSchema(value, schema, path = '$') {
  if (schema.$ref) {
    const name = schema.$ref.split('/').at(-1);
    return assertSchema(value, contract.components.schemas[name], path);
  }
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;
  assert.ok(types.includes(actual), `${path}: expected ${types}, got ${actual}`);
  if (actual === 'object') {
    for (const key of schema.required ?? []) assert.ok(Object.hasOwn(value, key), `${path}.${key} required`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `${path}.${key} not allowed`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (schema.properties[key]) assertSchema(child, schema.properties[key], `${path}.${key}`);
    }
  }
  if (actual === 'array') {
    if (schema.maxItems !== undefined) assert.ok(value.length <= schema.maxItems);
    value.forEach((item, index) => assertSchema(item, schema.items, `${path}[${index}]`));
  }
  if (actual === 'string' && schema.minLength !== undefined) assert.ok(value.length >= schema.minLength);
  if (actual === 'integer') {
    if (schema.minimum !== undefined) assert.ok(value >= schema.minimum);
    if (schema.maximum !== undefined) assert.ok(value <= schema.maximum);
  }
}

test('seven ordered anchors have closed native learning answers', () => {
  const positions = steps.map((step) => guide.indexOf(`<span id="arch-${step}"></span>`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.equal(new Set(positions).size, 7);
  for (const step of steps) {
    const body = section(step);
    const answer = body.match(/<details class="learning-answer">\s*<summary>[^<]+<\/summary>\s*([\s\S]+?)\s*<\/details>/);
    assert.ok(answer, `missing learning answer in ${step}`);
    assert.match(answer[1], /^<p><strong>Reasoning:<\/strong>\s+[\s\S]+<\/p>$/);
    assert.doesNotMatch(answer[1], /`|\*\*|\[[^\]]+\]\([^)]+\)/);
    assert.doesNotMatch(body, /<details\b[^>]*\bopen\b/);
    assert.match(body, /\*\*Problem\.\*\*/);
    assert.match(body, /\*\*Small workable baseline\.\*\*/);
    assert.match(body, /\*\*Changed requirement\.\*\*/);
    assert.match(body, /\*\*Failure\.\*\*/);
  }
  assert.ok(guide.split('\n').length >= 450 && guide.split('\n').length <= 600);
  assert.doesNotMatch(guide, /<script\b|<iframe\b/i);
});

test('fixture-backed catalogue and enrollment bodies follow the shared schemas', () => {
  const [page, enrollment] = jsonBlocks(section('contract'));
  assert.deepEqual(page, catalogueResponse);
  assert.deepEqual(enrollment, enrollmentResponse);
  assert.deepEqual(page.courses[0], architectureCourse);
  assert.equal(enrollment.id, architectureEnrollment);
  assert.equal(enrollment.learnerId, architectureLearner);
  assertSchema(page, contract.components.schemas.CoursePage);
  assertSchema(enrollment, contract.components.schemas.Enrollment);
  assert.equal(contract.components.schemas.CoursePage.properties.courses.maxItems, 20);
  assert.deepEqual(contract.components.schemas.Course.required, ['id', 'title', 'seats']);
  assert.equal(contract.components.schemas.Course.additionalProperties, false);
  assert.throws(() => assertSchema({ ...page.courses[0], extra: true }, contract.components.schemas.Course));
});

test('complete contract scope, versions, security and merge patch remain distinct', () => {
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.version, '1.0.0');
  const operations = Object.values(contract.paths).flatMap((path) => Object.keys(path).filter((key) => /^(get|post|put|patch|delete)$/.test(key)));
  assert.equal(operations.length, 7);
  assert.deepEqual(contract.components.securitySchemes.sessionCookie, { type: 'apiKey', in: 'cookie', name: 'session' });
  const patch = contract.paths['/courses/{courseId}'].patch;
  assert.equal(patch.requestBody.content['application/merge-patch+json'].schema.$ref, '#/components/schemas/CoursePatch');
  const schema = contract.components.schemas.CoursePatch;
  assertSchema({ title: 'API Fundamentals' }, schema);
  assert.throws(() => assertSchema({ title: null }, schema));
  assert.throws(() => assertSchema({ seats: null }, schema));
  assert.match(section('contract'), /valid cookie does not\s+imply an admin role/i);
  assert.match(section('contract'), /generated\s+stubs are not completed handlers/i);
  assert.match(section('contract'), /compatibility review/i);
  assert.match(section('contract'), /\[complete OpenAPI file\]\(contracts\/course_api\.openapi\.json\)/);
  assert.match(section('contract'), /JSON response examples above are not an API definition/i);
});

test('dashboard makes optional failure explicit and protects private views', () => {
  const [dashboard] = jsonBlocks(section('clients'));
  assert.deepEqual(dashboard.course, architectureCourse);
  assert.deepEqual(dashboard.learner, { id: architectureLearner, completion: 'completed' });
  assert.deepEqual(dashboard.recommendations, { status: 'unavailable', items: null });
  assert.match(section('clients'), /checking access to every private source/i);
  assert.match(section('clients'), /principal or permission scope, client view/i);
  assert.match(section('clients'), /not an empty recommendation list/i);
  assert.match(section('edge'), /strips incoming `X-User`/i);
  assert.match(section('edge'), /learner API must still check/i);
  assert.match(section('edge'), /issuer, audience and expiry/i);
});

test('capacity math uses separate stable and service-time models', () => {
  const { arrivalsPerSecond: rate, meanTimeInSystemSeconds: mean } = stableObservation;
  assert.equal(rate * mean, 5);
  const { concurrency, serviceSeconds, waitingCapacity, overloadArrivalsPerSecond, recoveryArrivalsPerSecond } = requestCapacityModel;
  const capacity = concurrency / serviceSeconds;
  assert.equal(capacity, 80);
  assert.equal(waitingCapacity / (overloadArrivalsPerSecond - capacity), 2);
  assert.equal(waitingCapacity / (capacity - recoveryArrivalsPerSecond), 2);
  const text = section('capacity');
  assert.match(text, /includes\s+waiting and service/i);
  assert.match(text, /not the previous observation's mean total W/i);
  assert.match(text, /not a production forecast/i);
  assert.match(text, /`429`[\s\S]*`503`/);
  assert.match(text, /retry budget/i);
});

test('replica and mesh choices preserve failure and trust boundaries', () => {
  const balancing = section('balancing');
  assert.match(balancing, /shared database idempotency/i);
  assert.match(balancing, /shared inbox or idempotency/i);
  assert.match(balancing, /not globally required/i);
  assert.match(balancing, /per\s+TCP connection/i);
  assert.match(balancing, /per request/i);
  assert.match(balancing, /cannot be moved while alive/i);
  assert.match(balancing, /not CPU use or latency/i);
  const next = section('next');
  assert.match(next, /does not decide whether `learner-7`/i);
  assert.match(next, /does not roll back a database\s+migration/i);
  assert.match(next, /do not force a mesh/i);
  assert.match(next, /library helpdesk/i);
});

test('relative links resolve and original source uses chapter-level links', () => {
  const links = [...guide.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
  for (const link of links) {
    assert.doesNotMatch(link, /^https?:|#\//);
    if (link.startsWith('#')) {
      assert.ok(guide.includes(`id="${link.slice(1)}"`), `missing target ${link}`);
      continue;
    }
    const [path, fragment] = link.split('#');
    assert.ok(existsSync(resolve(root, 'docs', path)), `missing ${link}`);
    if (path === '06-API-ARCHITECTURE.md') assert.equal(fragment, undefined);
  }
  for (const name of ['GATEWAYS-BFFS-AND-LOAD-BALANCING', 'SERVICE-MESH-AND-TRUST', 'API-CONTRACTS-AND-LIFECYCLE', 'BACKPRESSURE-AND-CAPACITY']) {
    assert.ok(links.includes(`lessons/${name}.md`));
  }
});
