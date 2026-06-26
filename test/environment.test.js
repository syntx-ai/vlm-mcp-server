import assert from 'node:assert/strict';
import test from 'node:test';
import { EnvironmentService, configurationService } from '../build/core/environment.js';
import { ApiError } from '../build/types/index.js';
import { configureEnv } from './helpers.js';

test('loads generic VLM configuration with defaults and normalized URLs', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com/v1',
    VLM_API_KEY: 'real-key',
    VLM_VISION_MODEL: 'vision-model',
    VLM_TIMEOUT: '1500',
    VLM_RETRY_COUNT: '2',
    VLM_VISION_MODEL_TEMPERATURE: '0.2',
    VLM_VISION_MODEL_TOP_P: '0.9',
    VLM_VISION_MODEL_MAX_TOKENS: '2048',
    VLM_ENABLE_THINKING: 'yes',
    SERVER_NAME: 'custom-server',
    SERVER_VERSION: '2.0.0'
  });

  const config = configurationService.getConfig();
  assert.equal(config.VLM_BASE_URL, 'https://api.example.com/v1/');
  assert.equal(config.VLM_PROVIDER, 'chat-completions');

  assert.deepEqual(configurationService.getServerConfig(), {
    name: 'custom-server',
    version: '2.0.0'
  });
  assert.deepEqual(configurationService.getVisionConfig(), {
    model: 'vision-model',
    timeout: 1500,
    retryCount: 2,
    url: 'https://api.example.com/v1/chat/completions',
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 2048,
    thinking: true
  });
  assert.equal(configurationService.getApiKey(), 'real-key');
});

test('provider-specific env groups override generic settings', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://generic.example.com',
    VLM_API_KEY: 'generic-key',
    VLM_PROVIDER: 'responses',
    OPENAI_RESPONSES_BASE_URL: 'https://responses.example.com/v1',
    OPENAI_RESPONSES_API_KEY: 'responses-key',
    OPENAI_RESPONSES_MODEL: 'gpt-response'
  });

  const config = configurationService.getConfig();
  assert.equal(config.VLM_BASE_URL, 'https://responses.example.com/v1/');
  assert.equal(config.VLM_API_KEY, 'responses-key');
  assert.equal(config.VLM_VISION_MODEL, 'gpt-response');
  assert.equal(configurationService.getVisionConfig().url, 'https://responses.example.com/v1/responses');
});

test('auto provider picks the first configured provider group, preferring chat completions', (t) => {
  configureEnv(t, {
    OPENAI_RESPONSES_BASE_URL: 'https://responses.example.com',
    OPENAI_RESPONSES_API_KEY: 'responses-key',
    OPENAI_CHAT_COMPLETIONS_BASE_URL: 'https://chat.example.com',
    OPENAI_CHAT_COMPLETIONS_API_KEY: 'chat-key'
  });

  const config = configurationService.getConfig();
  assert.equal(config.VLM_PROVIDER, 'chat-completions');
  assert.equal(config.VLM_BASE_URL, 'https://chat.example.com/');
  assert.equal(config.VLM_API_KEY, 'chat-key');
});

test('anthropic provider resolves canonical messages endpoint and version fallback', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.anthropic.com',
    VLM_API_KEY: 'sk-ant-real',
    VLM_PROVIDER: 'anthropic'
  });

  assert.equal(configurationService.getVisionConfig().url, 'https://api.anthropic.com/v1/messages');
  assert.equal(configurationService.getAnthropicVersion(), '2023-06-01');
});

test('endpoint URLs are preserved when already configured', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://proxy.example.com/responses',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'responses'
  });

  assert.equal(configurationService.getConfig().VLM_BASE_URL, 'https://proxy.example.com/responses');
  assert.equal(configurationService.getVisionConfig().url, 'https://proxy.example.com/responses');
});

test('invalid numbers fall back to stable defaults', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'real-key',
    VLM_TIMEOUT: '-1',
    VLM_RETRY_COUNT: '-2',
    VLM_VISION_MODEL_TEMPERATURE: 'not-a-number',
    VLM_VISION_MODEL_TOP_P: 'NaN',
    VLM_VISION_MODEL_MAX_TOKENS: '0'
  });

  const vision = configurationService.getVisionConfig();
  assert.equal(vision.timeout, 300000);
  assert.equal(vision.retryCount, 1);
  assert.equal(vision.temperature, 0.8);
  assert.equal(vision.topP, 0.6);
  assert.equal(vision.maxTokens, 32768);
});

test('missing base URL and placeholder API keys fail fast', (t) => {
  configureEnv(t, {
    VLM_API_KEY: 'real-key'
  });
  assert.throws(() => configurationService.getConfig(), ApiError);
});

test('placeholder API key is rejected', (t) => {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com',
    VLM_API_KEY: 'your_api_key'
  });
  assert.throws(() => EnvironmentService.getInstance().getConfig(), /actual API key/);
});
