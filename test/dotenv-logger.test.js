import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { loadDotEnv } from '../build/utils/dotenv.js';
import { logger, setupConsoleRedirection } from '../build/utils/logger.js';
import { makeTempDir } from './helpers.js';

test('loadDotEnv reads env files, strips quotes, ignores comments, and preserves existing env', (t) => {
  const dir = makeTempDir(t);
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, [
    '# comment',
    'PLAIN=value',
    'DOUBLE_QUOTED="quoted value"',
    "SINGLE_QUOTED='single quoted'",
    'WITH_EQUALS=a=b=c',
    'NO_EQUALS',
    '',
    'EXISTING=from-file'
  ].join('\n'));
  const keys = ['PLAIN', 'DOUBLE_QUOTED', 'SINGLE_QUOTED', 'WITH_EQUALS', 'EXISTING'];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.EXISTING = 'from-env';

  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      }
      else {
        process.env[key] = value;
      }
    }
  });

  loadDotEnv(envPath);

  assert.equal(process.env.PLAIN, 'value');
  assert.equal(process.env.DOUBLE_QUOTED, 'quoted value');
  assert.equal(process.env.SINGLE_QUOTED, 'single quoted');
  assert.equal(process.env.WITH_EQUALS, 'a=b=c');
  assert.equal(process.env.EXISTING, 'from-env');
});

test('loadDotEnv returns without throwing when the file is absent', () => {
  assert.doesNotThrow(() => loadDotEnv('/tmp/does-not-exist-vlm-env-file'));
});

test('logger serializes errors and unserializable values safely', () => {
  const error = Object.assign(new Error('boom'), { code: 'ERR_TEST' });
  const serialized = logger.safeStringify([error]);
  assert.match(serialized, /"name":"Error"/);
  assert.match(serialized, /"message":"boom"/);
  assert.match(serialized, /"code":"ERR_TEST"/);

  const circular = {};
  circular.self = circular;
  assert.equal(logger.safeStringify(circular), '[object Object]');
});

test('setupConsoleRedirection redirects console methods and writes to configured log file', async (t) => {
  const dir = makeTempDir(t);
  const logPath = path.join(dir, 'vlm.log');
  const previousLogPath = process.env.VLM_LOG_PATH;
  process.env.VLM_LOG_PATH = logPath;
  const original = setupConsoleRedirection();

  t.after(() => {
    console.debug = original.debug;
    console.error = original.error;
    console.info = original.info;
    console.log = original.log;
    console.warn = original.warn;
    logger.logStream = undefined;
    if (previousLogPath === undefined) {
      delete process.env.VLM_LOG_PATH;
    }
    else {
      process.env.VLM_LOG_PATH = previousLogPath;
    }
  });

  console.info('log redirection test', { ok: true });
  await new Promise((resolve) => logger.logStream.end(resolve));

  assert.notEqual(console.info, original.info);
  assert.match(fs.readFileSync(logPath, 'utf8'), /log redirection test/);
});
