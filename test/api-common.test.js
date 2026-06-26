import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createErrorResponse,
  createImageContent,
  createMultiModalMessage,
  createSuccessResponse,
  createTextMessage,
  createVideoContent,
  formatMcpResponse,
  isRetryableError,
  withRetry
} from '../build/core/api-common.js';
import { ApiError, FileNotFoundError, ValidationError } from '../build/types/index.js';

test('message and content helpers create provider-compatible shapes', () => {
  const image = createImageContent('https://example.com/image.png');
  const video = createVideoContent('https://example.com/video.mp4');

  assert.deepEqual(image, {
    type: 'image_url',
    image_url: { url: 'https://example.com/image.png' }
  });
  assert.deepEqual(video, {
    type: 'video_url',
    video_url: { url: 'https://example.com/video.mp4' }
  });
  assert.deepEqual(createTextMessage('hello'), [{
    role: 'user',
    content: [{ type: 'text', text: 'hello' }]
  }]);
  assert.deepEqual(createMultiModalMessage([image, video], 'describe'), [{
    role: 'user',
    content: [image, video, { type: 'text', text: 'describe' }]
  }]);
});

test('standard responses format successful string and object data for MCP', () => {
  assert.deepEqual(formatMcpResponse(createSuccessResponse('ok')), {
    content: [{ type: 'text', text: 'ok' }]
  });

  assert.deepEqual(formatMcpResponse(createSuccessResponse({ answer: 42 })), {
    content: [{ type: 'text', text: JSON.stringify({ answer: 42 }, null, 2) }]
  });
});

test('standard error responses include MCP error marker and optional context', () => {
  const error = new Error('boom');
  const response = createErrorResponse('failed', error);

  assert.equal(response.success, false);
  assert.equal(response.error, 'failed');
  assert.equal(response.context.name, 'Error');
  assert.deepEqual(formatMcpResponse(response), {
    content: [{ type: 'text', text: 'Error: failed' }],
    isError: true
  });
});

test('retry classification excludes validation/file errors and includes transient API failures', () => {
  assert.equal(isRetryableError(new FileNotFoundError('/missing.png')), false);
  assert.equal(isRetryableError(new ValidationError('bad input')), false);
  assert.equal(isRetryableError(new ApiError('bad request', {}, 400)), false);
  assert.equal(isRetryableError(new ApiError('rate limited', {}, 429)), true);
  assert.equal(isRetryableError(new ApiError('gateway', {}, 502)), true);
  assert.equal(isRetryableError(new ApiError('network timeout')), true);
  assert.equal(isRetryableError({ code: 'VALIDATION_ERROR' }), false);
  assert.equal(isRetryableError({ cause: new ApiError('temporary', {}, 503) }), true);
});

test('withRetry retries retryable failures with forwarded arguments', async () => {
  let attempts = 0;
  const fn = withRetry(async (prefix, value) => {
    attempts += 1;
    if (attempts < 3) {
      throw new ApiError('temporary', {}, 503);
    }
    return `${prefix}:${value}`;
  }, 3, 0);

  assert.equal(await fn('ok', 7), 'ok:7');
  assert.equal(attempts, 3);
});

test('withRetry stops immediately on non-retryable errors', async () => {
  let attempts = 0;
  const fn = withRetry(async () => {
    attempts += 1;
    throw new ValidationError('invalid');
  }, 5, 0);

  await assert.rejects(fn(), ValidationError);
  assert.equal(attempts, 1);
});

test('withRetry normalizes negative retry counts to a single attempt', async () => {
  let attempts = 0;
  const fn = withRetry(async () => {
    attempts += 1;
    throw new ApiError('temporary', {}, 503);
  }, -1, 0);

  await assert.rejects(fn(), ApiError);
  assert.equal(attempts, 1);
});
