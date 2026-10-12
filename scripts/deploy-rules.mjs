#!/usr/bin/env node
// Despliega firestore.rules directamente contra la Firebase Rules API,
// sin pasar por `firebase deploy` (que necesita permisos de Service Usage
// que el service account del Admin SDK no tiene por default).
// Credenciales: ver scripts/credentials.mjs. Lo corre GitHub Actions antes de
// cada publicación (.github/workflows/deploy-pages.yml).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleAuth } from 'google-auth-library';
import { loadServiceAccount } from './credentials.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const credentials = loadServiceAccount();
const projectId = credentials.project_id;
const rulesSource = readFileSync(join(__dirname, '..', 'firestore.rules'), 'utf-8');

const auth = new GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/firebase', 'https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

async function call(method, path, body) {
  const res = await fetch(`https://firebaserules.googleapis.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

console.log('Creando ruleset...');
const ruleset = await call('POST', `projects/${projectId}/rulesets`, {
  source: { files: [{ name: 'firestore.rules', content: rulesSource }] },
});
console.log('Ruleset creado:', ruleset.name);

console.log('Publicando release cloud.firestore...');
await call('PATCH', `projects/${projectId}/releases/cloud.firestore`, {
  release: {
    name: `projects/${projectId}/releases/cloud.firestore`,
    rulesetName: ruleset.name,
  },
  updateMask: 'rulesetName',
});
console.log('Reglas de Firestore publicadas.');
