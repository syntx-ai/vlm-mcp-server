import assert from 'node:assert/strict';
import test from 'node:test';
import { BaseImageAnalysisService } from '../build/core/base-image-service.js';
import { ChatService } from '../build/core/chat-service.js';
import { ToolExecutionError } from '../build/core/error-handler.js';
import { ApiError } from '../build/types/index.js';
import { configureEnv, jsonResponse, requestBody, silenceConsole, stubFetch } from './helpers.js';

test('processImageSource validates and returns URL image content unchanged', async () => {
  const service = new BaseImageAnalysisService();
  const calls = [];
  service.fileService = {
    validateImageSource: async (...args) => calls.push(args),
    isUrl: () => true,
    encodeImageToBase64: async () => {
      throw new Error('should not encode URLs');
    }
  };

  const content = await service.processImageSource('https://example.com/image.png');
  assert.deepEqual(calls, [['https://example.com/image.png', 5]]);
  assert.deepEqual(content, {
    type: 'image_url',
    image_url: { url: 'https://example.com/image.png' }
  });
});

test('processImageSource encodes local images before creating image content', async () => {
  const service = new BaseImageAnalysisService();
  service.fileService = {
    validateImageSource: async () => {},
    isUrl: () => false,
    encodeImageToBase64: async (source) => `data:image/png;base64,${source}`
  };

  assert.deepEqual(await service.processImageSource('/tmp/image.png'), {
    type: 'image_url',
    image_url: { url: 'data:image/png;base64,/tmp/image.png' }
  });
});

test('processMultipleImageSources preserves source order', async () => {
  const service = new BaseImageAnalysisService();
  service.processImageSource = async (source) => ({
    type: 'image_url',
    image_url: { url: `processed:${source}` }
  });

  assert.deepEqual(await service.processMultipleImageSources(['first', 'second']), [
    { type: 'image_url', image_url: { url: 'processed:first' } },
    { type: 'image_url', image_url: { url: 'processed:second' } }
  ]);
});

test('executeVisionAnalysis builds system plus multimodal user messages', async (t) => {
  silenceConsole(t);
  const service = new BaseImageAnalysisService();
  let received;
  service.chatService = {
    visionCompletions: async (messages) => {
      received = messages;
      return 'analysis';
    }
  };
  const image = { type: 'image_url', image_url: { url: 'img' } };

  assert.equal(await service.executeVisionAnalysis('system', 'prompt', [image], 'tool'), 'analysis');
  assert.deepEqual(received, [
    { role: 'system', content: 'system' },
    { role: 'user', content: [image, { type: 'text', text: 'prompt' }] }
  ]);
});

test('executeVisionAnalysis wraps downstream failures as ToolExecutionError', async (t) => {
  silenceConsole(t);
  const service = new BaseImageAnalysisService();
  service.chatService = {
    visionCompletions: async () => {
      throw new Error('model failed');
    }
  };

  await assert.rejects(
    service.executeVisionAnalysis('system', 'prompt', [], 'tool'),
    (error) => error instanceof ToolExecutionError
      && error.code === 'EXECUTION_ERROR'
      && error.context.operation === 'executeVisionAnalysis'
      && error.cause.message === 'model failed'
  );
});

test('executeVisionAnalysis preserves provider ApiError for tool handlers', async (t) => {
  silenceConsole(t);
  const service = new BaseImageAnalysisService();
  const apiError = new ApiError('provider failed', {}, 500);
  service.chatService = {
    visionCompletions: async () => {
      throw apiError;
    }
  };

  await assert.rejects(
    service.executeVisionAnalysis('system', 'prompt', [], 'tool'),
    (error) => error === apiError
  );
});

test('validatePrompt rejects empty and whitespace prompts', () => {
  const service = new BaseImageAnalysisService();

  assert.doesNotThrow(() => service.validatePrompt('hello', 'tool'));
  assert.throws(() => service.validatePrompt('', 'tool'), ToolExecutionError);
  assert.throws(() => service.validatePrompt('   ', 'tool'), ToolExecutionError);
});

test('ChatService delegates to configured provider with thinking flag', async (t) => {
  silenceConsole(t);
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com/v1',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'chat-completions',
    VLM_ENABLE_THINKING: 'true',
    VLM_RETRY_COUNT: '0'
  });
  const calls = stubFetch(t, async () => jsonResponse({
    choices: [{ message: { content: 'chat result' } }]
  }));

  const messages = [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }];
  assert.equal(await new ChatService().visionCompletions(messages), 'chat result');
  assert.deepEqual(requestBody(calls).thinking, { type: 'enabled' });
});
