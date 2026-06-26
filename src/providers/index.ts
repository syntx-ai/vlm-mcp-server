import { ApiError } from '../types/index.js';
import type { VisionProvider } from './types.js';
import { ChatCompletionsProvider } from './chat-completions.js';
import { ResponsesProvider } from './responses.js';
import { AnthropicProvider } from './anthropic.js';
import { configurationService } from '../core/environment.js';

/**
 * Resolve the active VisionProvider based on configuration.
 *
 * Selection order (first match wins):
 *   1. VLM_PROVIDER env var, one of:
 *        chat-completions | responses | anthropic | auto
 *   2. auto: infer from the configured base URL / API key prefix
 */
export function createVisionProvider(): VisionProvider {
    const config = configurationService.getConfig();
    const providerKind = (config.VLM_PROVIDER || config.PROVIDER || 'auto').toLowerCase();

    switch (providerKind) {
        case 'chat-completions':
        case 'chatcompletions':
        case 'openai':
            return new ChatCompletionsProvider();
        case 'responses':
        case 'response':
            return new ResponsesProvider();
        case 'anthropic':
        case 'claude':
            return new AnthropicProvider();
        case 'auto':
            return inferProvider();
        default:
            throw new ApiError(
                `Unknown VLM_PROVIDER '${providerKind}'. Use one of: chat-completions, responses, anthropic, auto.`,
                { provider: providerKind }
            );
    }
}

/** Infer the provider family from base URL / key shape when in auto mode. */
function inferProvider(): VisionProvider {
    const config = configurationService.getConfig();
    const baseUrl = config.VLM_BASE_URL.toLowerCase();
    const apiKey = config.VLM_API_KEY || '';

    if (baseUrl.includes('anthropic') || apiKey.toLowerCase().startsWith('sk-ant')) {
        return new AnthropicProvider();
    }
    // Default: OpenAI-compatible Chat Completions covers the vast majority
    // of providers (OpenAI, OpenRouter, Together, Groq, DeepSeek, local, ...).
    return new ChatCompletionsProvider();
}

let cachedProvider: VisionProvider | null = null;
/** Singleton accessor; the provider is resolved once at startup. */
export function getVisionProvider(): VisionProvider {
    if (!cachedProvider) {
        cachedProvider = createVisionProvider();
        console.info('Vision provider selected', { kind: cachedProvider.kind });
    }
    return cachedProvider;
}
