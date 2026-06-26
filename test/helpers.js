import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { configurationService, EnvironmentService } from '../build/core/environment.js';

const ENV_KEYS = [
  'OPENAI_CHAT_COMPLETIONS_API_KEY',
  'OPENAI_CHAT_COMPLETIONS_BASE_URL',
  'OPENAI_CHAT_COMPLETIONS_MODEL',
  'OPENAI_RESPONSES_API_KEY',
  'OPENAI_RESPONSES_BASE_URL',
  'OPENAI_RESPONSES_MODEL',
  'OPENAI_ANTHROPIC_API_KEY',
  'OPENAI_ANTHROPIC_BASE_URL',
  'OPENAI_ANTHROPIC_MODEL',
  'VLM_BASE_URL',
  'VLM_API_KEY',
  'VLM_VISION_MODEL',
  'VLM_VISION_MODEL_TEMPERATURE',
  'VLM_VISION_MODEL_TOP_P',
  'VLM_VISION_MODEL_MAX_TOKENS',
  'VLM_TIMEOUT',
  'VLM_RETRY_COUNT',
  'VLM_PROVIDER',
  'PROVIDER',
  'VLM_ENABLE_THINKING',
  'VLM_ANTHROPIC_VERSION',
  'VISION_MODEL',
  'VISION_MODEL_TEMPERATURE',
  'VISION_MODEL_TOP_P',
  'VISION_MODEL_MAX_TOKENS',
  'REQUEST_TIMEOUT',
  'RETRY_COUNT',
  'ENABLE_THINKING',
  'ANTHROPIC_VERSION',
  'SERVER_NAME',
  'SERVER_VERSION'
];

export function resetEnvironmentConfig() {
  configurationService.config = null;
  EnvironmentService.instance = configurationService;
}

export function configureEnv(t, values = {}) {
  const keys = [...new Set([...ENV_KEYS, ...Object.keys(values)])];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));

  for (const key of keys) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      process.env[key] = String(value);
    }
  }
  resetEnvironmentConfig();

  t.after(() => {
    for (const key of keys) {
      const oldValue = previous.get(key);
      if (oldValue === undefined) {
        delete process.env[key];
      }
      else {
        process.env[key] = oldValue;
      }
    }
    resetEnvironmentConfig();
  });
}

export function silenceConsole(t) {
  const originals = {
    debug: console.debug,
    error: console.error,
    info: console.info,
    log: console.log,
    warn: console.warn
  };
  console.debug = () => {};
  console.error = () => {};
  console.info = () => {};
  console.log = () => {};
  console.warn = () => {};
  t.after(() => {
    console.debug = originals.debug;
    console.error = originals.error;
    console.info = originals.info;
    console.log = originals.log;
    console.warn = originals.warn;
  });
}

export function jsonResponse(body, { status = 200, textBody } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => textBody ?? JSON.stringify(body)
  };
}

export function stubFetch(t, impl) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (...args) => {
    calls.push(args);
    return impl(...args);
  });
  return calls;
}

export function requestBody(fetchCalls, index = 0) {
  return JSON.parse(fetchCalls[index][1].body);
}

export function requestHeaders(fetchCalls, index = 0) {
  return fetchCalls[index][1].headers;
}

export function makeTempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vlm-mcp-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function captureTool(registerTool) {
  let captured;
  const server = {
    tool: (...args) => {
      captured = args;
    }
  };
  registerTool(server);
  assert.ok(captured, 'expected tool registration');
  const [name, description, schema, handler] = captured;
  return { name, description, schema, handler };
}

export function assertTextResponse(response, expectedText) {
  assert.deepEqual(response, {
    content: [{ type: 'text', text: expectedText }]
  });
}

export function assertErrorText(response, expectedSubstring) {
  assert.equal(response.isError, true);
  assert.equal(response.content[0].type, 'text');
  assert.match(response.content[0].text, expectedSubstring);
}
