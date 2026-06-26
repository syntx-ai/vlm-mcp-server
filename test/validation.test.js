import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { CommonSchemas, RuntimeValidator, ToolSchemaBuilder } from '../build/utils/validation.js';
import { ValidationError } from '../build/types/index.js';
import { silenceConsole } from './helpers.js';

test('RuntimeValidator returns parsed data on success', () => {
  const schema = z.object({ count: z.number().int().positive() });
  const result = RuntimeValidator.validate({ count: 2 }, schema);

  assert.deepEqual(result, {
    success: true,
    data: { count: 2 }
  });
});

test('RuntimeValidator throws standardized validation errors by default', (t) => {
  silenceConsole(t);
  const schema = z.object({ name: z.string().min(1) });

  assert.throws(
    () => RuntimeValidator.validate({ name: '' }, schema, { customMessage: 'custom failure' }),
    (error) => error instanceof ValidationError
      && error.message === 'custom failure'
      && Array.isArray(error.context.errors)
  );
});

test('safeValidate reports validation failures without throwing', (t) => {
  silenceConsole(t);
  const schema = z.object({ id: z.string().uuid() });
  const result = RuntimeValidator.safeValidate({ id: 'bad' }, schema);

  assert.equal(result.success, false);
  assert.equal(result.error.code, 'VALIDATION_ERROR');
  assert.match(result.error.message, /Invalid uuid/);
});

test('parseZodError exposes field, code, expected, and received metadata', () => {
  const schema = z.object({
    name: z.string(),
    amount: z.number().min(10).max(20)
  });
  const parsed = schema.safeParse({ name: 3, amount: 5 });
  assert.equal(parsed.success, false);

  const errors = RuntimeValidator.parseZodError(parsed.error);
  assert.deepEqual(errors[0], {
    message: 'Expected string, received number',
    field: 'name',
    code: 'invalid_type',
    expected: 'string',
    received: 'number'
  });
  assert.equal(errors[1].expected, 'minimum 10');
});

test('sanitizeData redacts top-level sensitive fields', () => {
  assert.deepEqual(RuntimeValidator.sanitizeData({
    apiKey: 'secret',
    token: 'token',
    password: 'password',
    authHeader: 'bearer',
    visible: 'ok'
  }), {
    apiKey: '[REDACTED]',
    token: '[REDACTED]',
    password: '[REDACTED]',
    authHeader: '[REDACTED]',
    visible: 'ok'
  });
  assert.equal(RuntimeValidator.sanitizeData('plain'), 'plain');
});

test('CommonSchemas enforce shared validation constraints', () => {
  assert.equal(CommonSchemas.nonEmptyString.safeParse('x').success, true);
  assert.equal(CommonSchemas.nonEmptyString.safeParse('').success, false);
  assert.equal(CommonSchemas.positiveInteger.safeParse(1).success, true);
  assert.equal(CommonSchemas.nonNegativeInteger.safeParse(0).success, true);
  assert.equal(CommonSchemas.url.safeParse('https://example.com').success, true);
  assert.equal(CommonSchemas.email.safeParse('user@example.com').success, true);
  assert.equal(CommonSchemas.uuid.safeParse('123e4567-e89b-12d3-a456-426614174000').success, true);
  assert.equal(CommonSchemas.filePath.safeParse('../secret').success, false);
  assert.equal(CommonSchemas.toolName.safeParse('valid-tool-1').success, true);
  assert.equal(CommonSchemas.toolName.safeParse('Invalid').success, false);
});

test('ToolSchemaBuilder builds required, optional, and defaulted fields', () => {
  const schema = new ToolSchemaBuilder()
    .required('name', z.string())
    .optional('description', z.string())
    .withDefault('count', z.number(), 3)
    .build();

  assert.deepEqual(schema.parse({ name: 'tool' }), {
    name: 'tool',
    count: 3
  });
  assert.deepEqual(schema.parse({ name: 'tool', description: 'd', count: 4 }), {
    name: 'tool',
    description: 'd',
    count: 4
  });
});
