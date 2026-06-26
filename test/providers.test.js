import assert from 'node:assert/strict';
import test from 'node:test';
import { configurationService } from '../build/core/environment.js';
import { AnthropicProvider } from '../build/providers/anthropic.js';
import { ChatCompletionsProvider, toChatCompletionsMessages } from '../build/providers/chat-completions.js';
import { createVisionProvider } from '../build/providers/index.js';
import { ResponsesProvider } from '../build/providers/responses.js';
import { postJson, resolveModel } from '../build/providers/types.js';
import { ApiError } from '../build/types/index.js';
import { configureEnv, jsonResponse, requestBody, requestHeaders, silenceConsole, stubFetch } from './helpers.js';

const sampleMessages = [
  { role: 'system', content: 'system prompt' },
  {
    role: 'user',
    content: [
      { type: 'text', text: 'describe' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      { type: 'video_url', video_url: { url: 'https://example.com/clip.mp4' } }
    ]
  }
];

test('postJson posts JSON with bearer auth and parses JSON responses', async (t) => {
  const calls = stubFetch(t, async () => jsonResponse({ ok: true }));

  assert.deepEqual(await postJson('https://api.example.com', 'key', { 'X-Test': 'yes' }, { a: 1 }, 1000), { ok: true });
  assert.equal(calls[0][0], 'https://api.example.com');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(requestBody(calls), { a: 1 });
  assert.equal(requestHeaders(calls).Authorization, 'Bearer key');
  assert.equal(requestHeaders(calls)['Content-Type'], 'application/json');
  assert.equal(requestHeaders(calls).Connection, 'keep-alive');
  assert.equal(requestHeaders(calls)['X-Test'], 'yes');
});

test('postJson supports x-api-key auth when bearer prefix is empty', async (t) => {
  const calls = stubFetch(t, async () => jsonResponse({ ok: true }));

  await postJson('https://api.example.com', 'anthropic-key', {}, {}, 1000, '');
  assert.equal(requestHeaders(calls)['x-api-key'], 'anthropic-key');
  assert.equal('Authorization' in requestHeaders(calls), false);
});

test('postJson converts HTTP and fetch failures to ApiError', async (t) => {
  stubFetch(t, async () => jsonResponse({ error: 'bad' }, { status: 500, textBody: 'bad gateway' }));

  await assert.rejects(
    postJson('https://api.example.com', 'key', {}, {}, 1000),
    (error) => error instanceof ApiError
      && error.statusCode === 500
      && error.details === 'bad gateway'
  );
});

test('postJson converts abort and network failures to ApiError', async (t) => {
  const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const calls = stubFetch(t, async () => {
    throw calls.length === 1 ? abort : new Error('fetch failed', { cause: 'dns' });
  });

  await assert.rejects(postJson('https://api.example.com/a', 'key', {}, {}, 10), /Request timeout after 10ms/);
  await assert.rejects(postJson('https://api.example.com/b', 'key', {}, {}, 10), /Failed to connect/);
});

test('resolveModel prefers per-request model and falls back to configured model', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'real-key',
    VLM_VISION_MODEL: 'configured-model'
  });

  assert.equal(resolveModel({ messages: [], model: 'request-model' }), 'request-model');
  assert.equal(resolveModel({ messages: [] }), 'configured-model');
});

test('ChatCompletionsProvider builds request bodies and flattens array content', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com/v1',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'chat-completions',
    VLM_VISION_MODEL: 'configured-model',
    VLM_VISION_MODEL_TEMPERATURE: '0.6',
    VLM_VISION_MODEL_TOP_P: '0.7',
    VLM_VISION_MODEL_MAX_TOKENS: '4096',
    VLM_TIMEOUT: '5000'
  });
  const calls = stubFetch(t, async () => jsonResponse({
    choices: [{ message: { content: [{ text: 'hello ' }, 'world', { ignored: true }] } }]
  }));

  const result = await new ChatCompletionsProvider().complete({
    messages: sampleMessages,
    model: 'request-model',
    thinking: true,
    temperature: 0.1,
    topP: 0.2,
    maxTokens: 123
  });

  assert.equal(result, 'hello world');
  assert.equal(calls[0][0], 'https://api.example.com/v1/chat/completions');
  assert.deepEqual(requestBody(calls), {
    model: 'request-model',
    messages: sampleMessages,
    thinking: { type: 'enabled' },
    stream: false,
    temperature: 0.1,
    top_p: 0.2,
    max_tokens: 123
  });
  assert.equal(requestHeaders(calls)['X-Title'], '4.5V MCP Local');
});

test('ChatCompletionsProvider rejects responses without content', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'real-key'
  });
  stubFetch(t, async () => jsonResponse({ choices: [{ message: {} }] }));

  await assert.rejects(new ChatCompletionsProvider().complete({ messages: sampleMessages }), /missing content/);
});

test('ResponsesProvider converts normalized messages into Responses API input', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com/v1',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'responses',
    VLM_VISION_MODEL: 'response-model'
  });
  const calls = stubFetch(t, async () => jsonResponse({ output_text: 'response text' }));

  assert.equal(await new ResponsesProvider().complete({ messages: sampleMessages, thinking: true }), 'response text');
  assert.equal(calls[0][0], 'https://api.example.com/v1/responses');
  assert.deepEqual(requestBody(calls).instructions, 'system prompt');
  assert.deepEqual(requestBody(calls).input, [{
    role: 'user',
    content: [
      { type: 'input_text', text: 'describe' },
      { type: 'input_image', image_url: 'data:image/png;base64,abc' },
      { type: 'input_image', image_url: 'https://example.com/clip.mp4' }
    ]
  }]);
  assert.deepEqual(requestBody(calls).reasoning, { effort: 'medium' });
  assert.equal(requestBody(calls).max_output_tokens, 32768);
});

test('ResponsesProvider extracts output-array text and rejects empty output', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'responses'
  });
  let callCount = 0;
  stubFetch(t, async () => {
    callCount += 1;
    if (callCount === 1) {
      return jsonResponse({
        output: [{
          type: 'message',
          content: [{ type: 'output_text', text: 'first ' }, { type: 'text', text: 'second' }]
        }]
      });
    }
    return jsonResponse({ output: [] });
  });

  const provider = new ResponsesProvider();
  assert.equal(await provider.complete({ messages: [{ role: 'user', content: 'hello' }] }), 'first second');
  await assert.rejects(provider.complete({ messages: [{ role: 'user', content: 'hello' }] }), /missing output text/);
});

test('AnthropicProvider converts messages, auth, image data URLs, and video hints', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.anthropic.com',
    VLM_API_KEY: 'anthropic-key',
    VLM_PROVIDER: 'anthropic',
    VLM_ANTHROPIC_VERSION: '2024-01-01',
    VLM_VISION_MODEL_MAX_TOKENS: '20000'
  });
  const calls = stubFetch(t, async () => jsonResponse({
    content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'claude' }]
  }));

  const messages = [
    ...sampleMessages,
    { role: 'system', content: [{ type: 'text', text: 'second system' }] }
  ];
  assert.equal(await new AnthropicProvider().complete({ messages, thinking: true }), 'hello claude');

  assert.equal(calls[0][0], 'https://api.anthropic.com/v1/messages');
  assert.equal(requestHeaders(calls)['x-api-key'], 'anthropic-key');
  assert.equal(requestHeaders(calls)['anthropic-version'], '2024-01-01');
  assert.equal('Authorization' in requestHeaders(calls), false);
  assert.equal(requestBody(calls).system, 'system prompt\n\nsecond system');
  assert.deepEqual(requestBody(calls).thinking, { type: 'enabled', budget_tokens: 16000 });
  assert.deepEqual(requestBody(calls).messages[0].content, [
    { type: 'text', text: 'describe' },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
    { type: 'text', text: '(video) https://example.com/clip.mp4' }
  ]);
});

test('AnthropicProvider keeps remote image URLs as URL sources and rejects empty content', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.anthropic.com',
    VLM_API_KEY: 'anthropic-key',
    VLM_PROVIDER: 'anthropic'
  });
  let callCount = 0;
  const calls = stubFetch(t, async () => {
    callCount += 1;
    return callCount === 1
      ? jsonResponse({ content: [{ type: 'text', text: 'ok' }] })
      : jsonResponse({ content: [] });
  });

  const provider = new AnthropicProvider();
  await provider.complete({
    messages: [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }]
    }]
  });
  assert.deepEqual(requestBody(calls).messages[0].content[0], {
    type: 'image',
    source: { type: 'url', url: 'https://example.com/image.png' }
  });
  await assert.rejects(provider.complete({ messages: [{ role: 'user', content: 'hello' }] }), /missing content/);
});

test('provider factory selects explicit providers, aliases, auto inference, and rejects unknown providers', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'response'
  });
  assert.equal(createVisionProvider().kind, 'responses');

  configurationService.config = null;
  process.env.VLM_PROVIDER = 'claude';
  assert.equal(createVisionProvider().kind, 'anthropic');

  configurationService.config = null;
  process.env.VLM_PROVIDER = 'openai';
  assert.equal(createVisionProvider().kind, 'chat-completions');

  configurationService.config = null;
  process.env.VLM_PROVIDER = 'auto';
  process.env.VLM_API_KEY = 'sk-ant-real';
  assert.equal(createVisionProvider().kind, 'anthropic');

  configurationService.config = null;
  process.env.VLM_PROVIDER = 'unknown';
  assert.throws(() => createVisionProvider(), /Unknown VLM_PROVIDER/);
});

test('toChatCompletionsMessages returns normalized messages unchanged', () => {
  assert.equal(toChatCompletionsMessages(sampleMessages), sampleMessages);
});
