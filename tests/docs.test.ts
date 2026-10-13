import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { prisma } from '../src/db/prisma';
import { openApiDocument } from '../src/docs/openapi';
import { api } from './helpers';

type Json = Record<string, unknown>;
type Operation = { security?: unknown[]; responses: Json; summary?: string; parameters?: Json[] };

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operations(): { method: (typeof METHODS)[number]; path: string; operation: Operation }[] {
  const result = [];
  for (const [route, item] of Object.entries(openApiDocument.paths as Record<string, Json>)) {
    for (const method of METHODS) {
      const operation = item[method] as Operation | undefined;
      if (operation) result.push({ method, path: route, operation });
    }
  }
  return result;
}

function collectRefs(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, found);
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') found.push(value);
      else collectRefs(value, found);
    }
  }
  return found;
}

describe('server basics', () => {
  it('GET /api/health reports that the server and the database are up', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns a JSON 404 for an unknown address', async () => {
    const res = await api().get('/api/no-such-thing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for a body that is not valid JSON', async () => {
    const res = await api()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('allows only the configured client address (CORS)', async () => {
    const allowed = await api().get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const blocked = await api().get('/api/health').set('Origin', 'http://evil.example');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('database (Prisma)', () => {
  it('has all the migrations applied', async () => {
    const rows = await prisma.$queryRaw<{ pending: bigint }[]>`
      SELECT count(*) AS pending FROM "_prisma_migrations" WHERE finished_at IS NULL`;
    expect(Number(rows[0]?.pending)).toBe(0);

    const folders = fs
      .readdirSync(path.join(__dirname, '..', 'prisma', 'migrations'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory());
    const applied = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM "_prisma_migrations"`;
    expect(Number(applied[0]?.count)).toBe(folders.length);
  });

  it('has the six tables of the design', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(rows.map((r) => r.table_name)).toEqual([
      'group_memberships',
      'groups',
      'message_recipients',
      'messages',
      'transactions',
      'users',
    ]);
  });
});

describe('Swagger / OpenAPI', () => {
  it('serves the Swagger UI page and the OpenAPI document', async () => {
    const page = await api().get('/api-docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');

    const doc = await api().get('/api-docs.json');
    expect(doc.status).toBe(200);
    expect(doc.body.openapi).toMatch(/^3\.0\./);
    expect(doc.body.info.title).toBe('ShareFund API');
  });

  it('defines JWT bearer authentication (the Authorize button)', () => {
    expect(openApiDocument.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });

  it('documents every operation with a summary, responses and its error codes', () => {
    const all = operations();
    expect(all).toHaveLength(21);

    for (const { method, path: route, operation } of all) {
      const label = `${method.toUpperCase()} ${route}`;
      expect(operation.summary, label).toEqual(expect.any(String));
      expect(Object.keys(operation.responses).length, label).toBeGreaterThan(0);

      const isPublic = route === '/api/health' || route === '/api/auth/login';
      if (!isPublic) {
        expect(operation.security, label).toBeDefined();
        expect(operation.responses['401'], label).toBeDefined();
      }
      // every {param} in the path is declared
      const inPath = [...route.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const declared = (operation.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name);
      expect(declared, label).toEqual(inPath);
    }
  });

  it('has no broken $ref', () => {
    const components = openApiDocument.components as unknown as Record<string, Json>;
    for (const pointer of collectRefs(openApiDocument)) {
      const [, , section, name] = pointer.split('/') as [string, string, string, string];
      expect(components[section]?.[name], pointer).toBeDefined();
    }
  });

  it('documents only routes that really exist on the server', async () => {
    for (const { method, path: route } of operations()) {
      const url = route.replace(/\{\w+\}/g, '1');
      const res = await api()[method](url);
      // an existing protected route answers 401 without a token; a missing route answers 404 NOT_FOUND
      expect(res.body?.error?.code, `${method.toUpperCase()} ${route}`).not.toBe('NOT_FOUND');
    }
  });

  it('keeps docs/openapi.json in sync with the code (npm run docs:generate)', () => {
    const file = path.join(__dirname, '..', 'docs', 'openapi.json');
    const saved = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    expect(saved).toEqual(JSON.parse(JSON.stringify(openApiDocument)));
  });
});
