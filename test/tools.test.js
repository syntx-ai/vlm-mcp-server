import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { registerDataVizAnalysisTool } from '../build/tools/data-viz.js';
import { registerDiagramAnalysisTool } from '../build/tools/diagram-analysis.js';
import { registerErrorDiagnosisTool } from '../build/tools/error-diagnosis.js';
import { registerGeneralImageAnalysisTool } from '../build/tools/general-image.js';
import { registerTextExtractionTool } from '../build/tools/text-extraction.js';
import { registerUiDiffCheckTool } from '../build/tools/ui-diff.js';
import { registerUiToArtifactTool } from '../build/tools/ui-to-artifact.js';
import { registerVideoAnalysisTool } from '../build/tools/video-analysis.js';
import { UI_TO_ARTIFACT_PROMPTS } from '../build/prompts/index.js';
import {
  assertErrorText,
  assertTextResponse,
  captureTool,
  configureEnv,
  jsonResponse,
  makeTempDir,
  requestBody,
  silenceConsole,
  stubFetch
} from './helpers.js';

function configureToolEnv(t) {
  configureEnv(t, {
    VLM_BASE_URL: 'https://api.example.com/v1',
    VLM_API_KEY: 'real-key',
    VLM_PROVIDER: 'chat-completions',
    VLM_RETRY_COUNT: '0'
  });
}

function setupSuccessfulTool(t, registerTool, responseText = 'analysis result') {
  silenceConsole(t);
  configureToolEnv(t);
  const calls = stubFetch(t, async () => jsonResponse({
    choices: [{ message: { content: responseText } }]
  }));
  return { tool: captureTool(registerTool), calls };
}

function userMessageText(calls) {
  const messages = requestBody(calls).messages;
  const user = messages.find((message) => message.role === 'user');
  const textPart = user.content.find((part) => part.type === 'text');
  return textPart.text;
}

const imageToolCases = [
  {
    registerTool: registerUiToArtifactTool,
    validParams: {
      image_source: 'https://example.com/ui.png',
      output_type: 'code',
      prompt: 'Generate code'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-ui.png',
      output_type: 'code',
      prompt: 'Generate code'
    }
  },
  {
    registerTool: registerTextExtractionTool,
    validParams: {
      image_source: 'https://example.com/text.png',
      prompt: 'Extract text'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-text.png',
      prompt: 'Extract text'
    }
  },
  {
    registerTool: registerErrorDiagnosisTool,
    validParams: {
      image_source: 'https://example.com/error.png',
      prompt: 'Diagnose'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-error.png',
      prompt: 'Diagnose'
    }
  },
  {
    registerTool: registerDiagramAnalysisTool,
    validParams: {
      image_source: 'https://example.com/diagram.png',
      prompt: 'Explain'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-diagram.png',
      prompt: 'Explain'
    }
  },
  {
    registerTool: registerDataVizAnalysisTool,
    validParams: {
      image_source: 'https://example.com/chart.png',
      prompt: 'Analyze'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-chart.png',
      prompt: 'Analyze'
    }
  },
  {
    registerTool: registerUiDiffCheckTool,
    validParams: {
      expected_image_source: 'https://example.com/expected.png',
      actual_image_source: 'https://example.com/actual.png',
      prompt: 'Compare'
    },
    missingFileParams: {
      expected_image_source: '/tmp/does-not-exist-vlm-expected.png',
      actual_image_source: 'https://example.com/actual.png',
      prompt: 'Compare'
    }
  },
  {
    registerTool: registerGeneralImageAnalysisTool,
    validParams: {
      image_source: 'https://example.com/image.png',
      prompt: 'Analyze'
    },
    missingFileParams: {
      image_source: '/tmp/does-not-exist-vlm-image.png',
      prompt: 'Analyze'
    }
  }
];

test('all tools register expected names and parameter keys', (t) => {
  silenceConsole(t);
  configureToolEnv(t);

  const registrations = [
    [registerUiToArtifactTool, 'ui_to_artifact', ['image_source', 'output_type', 'prompt']],
    [registerTextExtractionTool, 'extract_text_from_screenshot', ['image_source', 'prompt', 'programming_language']],
    [registerErrorDiagnosisTool, 'diagnose_error_screenshot', ['image_source', 'prompt', 'context']],
    [registerDiagramAnalysisTool, 'understand_technical_diagram', ['image_source', 'prompt', 'diagram_type']],
    [registerDataVizAnalysisTool, 'analyze_data_visualization', ['image_source', 'prompt', 'analysis_focus']],
    [registerUiDiffCheckTool, 'ui_diff_check', ['expected_image_source', 'actual_image_source', 'prompt']],
    [registerGeneralImageAnalysisTool, 'analyze_image', ['image_source', 'prompt']],
    [registerVideoAnalysisTool, 'analyze_video', ['video_source', 'prompt']]
  ];

  for (const [registerTool, expectedName, expectedKeys] of registrations) {
    const tool = captureTool(registerTool);
    assert.equal(tool.name, expectedName);
    assert.equal(typeof tool.description, 'string');
    assert.deepEqual(Object.keys(tool.schema).sort(), expectedKeys.sort());
    assert.equal(typeof tool.handler, 'function');
  }
});

test('general image tool sends a single image and prompt to chat completions provider', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerGeneralImageAnalysisTool);

  const response = await tool.handler({
    image_source: 'https://example.com/image.png',
    prompt: 'Describe the image'
  });

  assertTextResponse(response, 'analysis result');
  const body = requestBody(calls);
  assert.equal(body.messages[0].role, 'system');
  assert.equal(body.messages[1].role, 'user');
  assert.deepEqual(body.messages[1].content, [
    { type: 'image_url', image_url: { url: 'https://example.com/image.png' } },
    { type: 'text', text: 'Describe the image' }
  ]);
});

test('text extraction tool adds programming language hints when provided', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerTextExtractionTool);

  await tool.handler({
    image_source: 'https://example.com/code.png',
    prompt: 'Extract code',
    programming_language: 'TypeScript'
  });

  assert.match(userMessageText(calls), /<language_hint>The code is in TypeScript\.<\/language_hint>/);
});

test('error diagnosis tool adds contextual error details when provided', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerErrorDiagnosisTool);

  await tool.handler({
    image_source: 'https://example.com/error.png',
    prompt: 'What failed?',
    context: 'during deployment'
  });

  assert.match(userMessageText(calls), /<error_context>This error occurred during deployment\.<\/error_context>/);
});

test('diagram and data visualization tools add optional focus hints', async (t) => {
  const diagram = setupSuccessfulTool(t, registerDiagramAnalysisTool);
  await diagram.tool.handler({
    image_source: 'https://example.com/diagram.png',
    prompt: 'Explain it',
    diagram_type: 'sequence'
  });
  assert.match(userMessageText(diagram.calls), /<diagram_type_hint>This is a sequence diagram\.<\/diagram_type_hint>/);

  const dataViz = setupSuccessfulTool(t, registerDataVizAnalysisTool);
  await dataViz.tool.handler({
    image_source: 'https://example.com/chart.png',
    prompt: 'Find insights',
    analysis_focus: 'anomalies'
  });
  assert.match(userMessageText(dataViz.calls), /<analysis_focus>Focus particularly on: anomalies\.<\/analysis_focus>/);
});

test('UI to artifact tool chooses the system prompt for the requested output type', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerUiToArtifactTool);

  await tool.handler({
    image_source: 'https://example.com/ui.png',
    output_type: 'spec',
    prompt: 'Write a spec'
  });

  assert.equal(requestBody(calls).messages[0].content, UI_TO_ARTIFACT_PROMPTS.spec);
  assert.equal(userMessageText(calls), 'Write a spec');
});

test('UI diff tool sends expected and actual screenshots in order with comparison context', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerUiDiffCheckTool);

  await tool.handler({
    expected_image_source: 'https://example.com/expected.png',
    actual_image_source: 'https://example.com/actual.png',
    prompt: 'Find differences'
  });

  const content = requestBody(calls).messages[1].content;
  assert.deepEqual(content.slice(0, 2), [
    { type: 'image_url', image_url: { url: 'https://example.com/expected.png' } },
    { type: 'image_url', image_url: { url: 'https://example.com/actual.png' } }
  ]);
  assert.match(content[2].text, /The first image is the EXPECTED\/REFERENCE design/);
  assert.match(content[2].text, /Find differences/);
});

test('video analysis tool sends video content without adding a system prompt', async (t) => {
  const { tool, calls } = setupSuccessfulTool(t, registerVideoAnalysisTool);

  const response = await tool.handler({
    video_source: 'https://example.com/video.mp4',
    prompt: 'Summarize the action'
  });

  assertTextResponse(response, 'analysis result');
  assert.deepEqual(requestBody(calls).messages, [{
    role: 'user',
    content: [
      { type: 'video_url', video_url: { url: 'https://example.com/video.mp4' } },
      { type: 'text', text: 'Summarize the action' }
    ]
  }]);
});

test('video analysis tool encodes local videos before sending provider messages', async (t) => {
  const dir = makeTempDir(t);
  const mp4 = path.join(dir, 'clip.mp4');
  fs.writeFileSync(mp4, Buffer.from('frames'));
  const { tool, calls } = setupSuccessfulTool(t, registerVideoAnalysisTool);

  await tool.handler({
    video_source: mp4,
    prompt: 'Summarize the action'
  });

  const content = requestBody(calls).messages[0].content;
  assert.equal(content[0].type, 'video_url');
  assert.match(content[0].video_url.url, /^data:video\/mp4;base64,/);
});

test('tool handlers return MCP validation errors for invalid parameters', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);
  const tool = captureTool(registerGeneralImageAnalysisTool);

  const response = await tool.handler({
    image_source: 'https://example.com/image.png'
  });

  assertErrorText(response, /Validation failed: prompt: Required/);
});

test('each image tool converts invalid parameters to MCP validation errors', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);

  for (const { registerTool } of imageToolCases) {
    const tool = captureTool(registerTool);
    const response = await tool.handler({});
    assertErrorText(response, /Validation failed:/);
  }
});

test('image tools convert missing local files to MCP file errors', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);

  for (const { registerTool, missingFileParams } of imageToolCases) {
    const tool = captureTool(registerTool);
    const response = await tool.handler(missingFileParams);
    assertErrorText(response, /Image file not found/);
  }
});

test('image tools convert provider failures to MCP API errors', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);
  const calls = stubFetch(t, async () => jsonResponse({ error: 'bad' }, {
    status: 500,
    textBody: 'bad gateway'
  }));

  for (const { registerTool, validParams } of imageToolCases) {
    const tool = captureTool(registerTool);
    const response = await tool.handler(validParams);
    assertErrorText(response, /API error: HTTP 500: bad gateway/);
  }
  assert.equal(calls.length, imageToolCases.length);
});

test('video analysis tool reports missing local files and provider failures', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);
  const missingTool = captureTool(registerVideoAnalysisTool);
  const missingResponse = await missingTool.handler({
    video_source: '/tmp/does-not-exist-vlm-video.mp4',
    prompt: 'Analyze'
  });
  assertErrorText(missingResponse, /Video file not found/);

  const calls = stubFetch(t, async () => jsonResponse({ error: 'bad' }, {
    status: 500,
    textBody: 'bad gateway'
  }));
  const apiTool = captureTool(registerVideoAnalysisTool);

  const response = await apiTool.handler({
    video_source: 'https://example.com/video.mp4',
    prompt: 'Analyze'
  });

  assert.equal(calls.length, 1);
  assertErrorText(response, /API error: HTTP 500: bad gateway/);
});

test('video analysis tool reports unsupported local video formats as validation errors', async (t) => {
  silenceConsole(t);
  configureToolEnv(t);
  const dir = makeTempDir(t);
  const avi = path.join(dir, 'clip.avi');
  fs.writeFileSync(avi, 'avi');
  const tool = captureTool(registerVideoAnalysisTool);

  const response = await tool.handler({
    video_source: avi,
    prompt: 'Analyze'
  });

  assertErrorText(response, /Validation failed: Unsupported video format/);
});
