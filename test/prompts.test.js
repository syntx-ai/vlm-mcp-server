import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DATA_VIZ_ANALYSIS_PROMPT,
  DIAGRAM_UNDERSTANDING_PROMPT,
  ERROR_DIAGNOSIS_PROMPT,
  GENERAL_IMAGE_ANALYSIS_PROMPT,
  TEXT_EXTRACTION_PROMPT,
  UI_DIFF_CHECK_PROMPT,
  UI_TO_ARTIFACT_PROMPTS
} from '../build/prompts/index.js';

test('all prompt exports are populated with expected prompt families', () => {
  for (const prompt of [
    DATA_VIZ_ANALYSIS_PROMPT,
    DIAGRAM_UNDERSTANDING_PROMPT,
    ERROR_DIAGNOSIS_PROMPT,
    GENERAL_IMAGE_ANALYSIS_PROMPT,
    TEXT_EXTRACTION_PROMPT,
    UI_DIFF_CHECK_PROMPT
  ]) {
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 100);
  }

  assert.deepEqual(Object.keys(UI_TO_ARTIFACT_PROMPTS).sort(), [
    'code',
    'description',
    'prompt',
    'spec'
  ]);
  for (const prompt of Object.values(UI_TO_ARTIFACT_PROMPTS)) {
    assert.equal(typeof prompt, 'string');
    assert.ok(prompt.length > 100);
  }
});
