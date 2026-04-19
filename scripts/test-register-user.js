#!/usr/bin/env node

/**
 * Quick script to test the /api/auth/register endpoint.
 *
 * Usage:
 *   node scripts/test-register-user.js
 *   API_BASE_URL=http://localhost:4001 node scripts/test-register-user.js
 *
 * It will attempt to register a user with a random email and print the result.
 */

import crypto from 'crypto';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:4001';

const randomId = crypto.randomBytes(3).toString('hex');
const email = `test+${randomId}@example.com`;

const body = {
  name: `Test User ${randomId}`,
  email,
  password: 'P@ssw0rd!',
  role: 'doctor',
};

async function run() {
  console.log('Registering new user:', email);
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`Request failed (${res.status})`, data);
    process.exit(1);
  }

  console.log('Success!');
  console.log('Response:', JSON.stringify(data, null, 2));
  console.log('You can now use the returned token to call protected endpoints.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
