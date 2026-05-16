#!/usr/bin/env node

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const REQUIRED_CHAT_MODEL = 'llama3.2:3b';
const REQUIRED_EMBEDDING_MODEL = 'mxbai-embed-large';
const REQUIRED_EMBEDDING_DIMENSION = 1024;
const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434';

function fail(message) {
  console.error(`check:local-ai failed: ${message}`);
  process.exit(1);
}

function requireExactEnv(name, expected) {
  const actual = process.env[name];
  if (!actual) {
    fail(`Missing ${name}. Set ${name}=${expected}.`);
  }
  if (actual !== expected) {
    fail(`Invalid ${name}: ${actual}. Expected ${expected}.`);
  }
}

function rejectCloudEnv() {
  const unsupported = [
    'OPENAI_API_KEY',
    'OPENAI_CHAT_MODEL',
    'OPENAI_EMBEDDING_MODEL',
    'TOGETHER_API_KEY',
    'TOGETHER_CHAT_MODEL',
    'TOGETHER_EMBEDDING_MODEL',
    'LLM_API_URL',
    'LLM_API_KEY',
    'LLM_MODEL',
    'LLM_EMBEDDING_MODEL',
  ].filter((name) => !!process.env[name]);
  if (unsupported.length > 0) {
    fail(`Cloud LLM env vars are disabled for this local build: ${unsupported.join(', ')}.`);
  }
  if (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== 'ollama') {
    fail(`LLM_PROVIDER must be ollama.`);
  }
}

async function ollama(path, body) {
  const response = await fetch(`${OLLAMA_HOST}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    fail(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

rejectCloudEnv();
requireExactEnv('OLLAMA_MODEL', REQUIRED_CHAT_MODEL);
requireExactEnv('OLLAMA_EMBEDDING_MODEL', REQUIRED_EMBEDDING_MODEL);

const tags = await ollama('/api/tags');
const models = new Set((tags.models ?? []).map((model) => model.name));
for (const model of [REQUIRED_CHAT_MODEL, REQUIRED_EMBEDDING_MODEL]) {
  if (!models.has(model) && !models.has(`${model}:latest`)) {
    fail(`Required model ${model} is not installed. Run: ollama pull ${model}`);
  }
}

const chat = await ollama('/api/chat', {
  model: REQUIRED_CHAT_MODEL,
  messages: [{ role: 'user', content: 'Return exactly: ok' }],
  stream: false,
  tools: [
    {
      type: 'function',
      function: {
        name: 'idle',
        description: 'No-op tool used to verify tool schema support.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
  ],
});
if (!chat.message) {
  fail(`Chat model ${REQUIRED_CHAT_MODEL} did not return a message.`);
}

const embedding = await ollama('/api/embeddings', {
  model: REQUIRED_EMBEDDING_MODEL,
  prompt: 'local ai town embedding check',
});
if (!Array.isArray(embedding.embedding)) {
  fail(`Embedding model ${REQUIRED_EMBEDDING_MODEL} did not return an embedding array.`);
}
if (embedding.embedding.length !== REQUIRED_EMBEDDING_DIMENSION) {
  fail(
    `Embedding dimension ${embedding.embedding.length} does not match ${REQUIRED_EMBEDDING_DIMENSION}.`,
  );
}

console.log(
  `Local AI OK: ${REQUIRED_CHAT_MODEL}, ${REQUIRED_EMBEDDING_MODEL}, ${REQUIRED_EMBEDDING_DIMENSION}d embeddings.`,
);
