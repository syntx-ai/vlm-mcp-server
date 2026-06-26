import { ApiError } from '../types/index.js';

/**
 * Resolved environment configuration.
 *
 * Two naming layers are supported (later layers are sources for earlier
 * ones; precedence is documented inline):
 *  - Per-provider groups: OPENAI_CHAT_COMPLETIONS_*, OPENAI_RESPONSES_*,
 *    OPENAI_ANTHROPIC_* — let you configure each provider family separately.
 *  - Generic: VLM_BASE_URL, VLM_API_KEY, VLM_VISION_MODEL, VLM_PROVIDER, ...
 */
export interface EnvironmentConfig {
    // Provider config
    VLM_BASE_URL: string;
    VLM_API_KEY: string;
    VLM_VISION_MODEL?: string;
    VLM_VISION_MODEL_TEMPERATURE?: string;
    VLM_VISION_MODEL_TOP_P?: string;
    VLM_VISION_MODEL_MAX_TOKENS?: string;
    VLM_TIMEOUT?: string;
    VLM_RETRY_COUNT?: string;
    VLM_PROVIDER?: string;
    PROVIDER?: string;
    VLM_ANTHROPIC_VERSION?: string;
    // Server metadata
    SERVER_NAME?: string;
    SERVER_VERSION?: string;
}

/** Map a provider kind to its OPENAI_* env-var prefix. */
const PROVIDER_PREFIX: Record<string, string> = {
    'chat-completions': 'OPENAI_CHAT_COMPLETIONS',
    'responses': 'OPENAI_RESPONSES',
    'anthropic': 'OPENAI_ANTHROPIC'
};

/**
 * Environment configuration service using singleton pattern
 */
export class EnvironmentService {
    static instance: EnvironmentService | undefined;
    private config: EnvironmentConfig | null = null;
    private constructor() { }

    /**
     * Get singleton instance of EnvironmentService
     */
    static getInstance(): EnvironmentService {
        if (!EnvironmentService.instance) {
            EnvironmentService.instance = new EnvironmentService();
        }
        return EnvironmentService.instance;
    }

    /**
     * Get environment configuration
     */
    getConfig(): EnvironmentConfig {
        if (!this.config) {
            this.config = this.loadEnvironmentConfig();
        }
        return this.config;
    }

    /**
     * Resolve the active provider kind.
     *
     * Priority:
     *   1. VLM_PROVIDER / PROVIDER env var (if not 'auto')
     *   2. auto: pick the first OPENAI_<FAMILY>_* group that has both a key
     *      and a base URL configured (anthropic > responses > chat-completions
     *      is not assumed; we prefer chat-completions as the safe default, but
     *      only among groups actually configured)
     *   3. auto: infer from base URL / key shape
     */
    private resolveProviderKind(env: Record<string, string | undefined>): string {
        const explicit = (env.VLM_PROVIDER || env.PROVIDER || 'auto').toLowerCase();
        if (explicit !== 'auto') {
            return explicit;
        }
        // auto: detect which OPENAI_* group is configured
        const groups: Array<{ kind: string; prefix: string }> = [
            { kind: 'chat-completions', prefix: 'OPENAI_CHAT_COMPLETIONS' },
            { kind: 'responses', prefix: 'OPENAI_RESPONSES' },
            { kind: 'anthropic', prefix: 'OPENAI_ANTHROPIC' }
        ];
        const configured = groups.filter(g => env[`${g.prefix}_API_KEY`] && env[`${g.prefix}_BASE_URL`]);
        if (configured.length > 0) {
            // Prefer chat-completions if present, otherwise the first configured.
            const preferred = configured.find(g => g.kind === 'chat-completions') || configured[0];
            return preferred.kind;
        }
        // Infer from base URL / key
        const baseUrl = (env.VLM_BASE_URL || '').toLowerCase();
        const apiKey = env.VLM_API_KEY || '';
        if (baseUrl.includes('anthropic') || apiKey.toLowerCase().startsWith('sk-ant')) {
            return 'anthropic';
        }
        return 'chat-completions';
    }

    /**
     * Load environment configuration from process.env
     */
    loadEnvironmentConfig(): EnvironmentConfig {
        const env = { ...process.env } as Record<string, string | undefined>;

        // ---- Resolve provider kind first (drives per-provider group lookup) ----
        const providerKind = this.resolveProviderKind(env);
        const groupPrefix = PROVIDER_PREFIX[providerKind];

        // ---- Resolve base URL ----
        // Priority: OPENAI_<GROUP>_BASE_URL > VLM_BASE_URL
        let baseUrl = (groupPrefix && env[`${groupPrefix}_BASE_URL`])
            || env.VLM_BASE_URL;

        if (!baseUrl) {
            throw new ApiError('VLM_BASE_URL (or OPENAI_<FAMILY>_BASE_URL) environment variable is required');
        }

        // Ensure trailing slash so `+ 'chat/completions'` joins correctly,
        // unless the URL already ends with a known endpoint path.
        const endsWithEndpoint = /\/(chat\/completions|responses|messages)$/.test(baseUrl);
        if (!endsWithEndpoint && !baseUrl.endsWith('/')) {
            baseUrl = `${baseUrl}/`;
        }

        // ---- Resolve API key ----
        let apiKey = (groupPrefix && env[`${groupPrefix}_API_KEY`])
            || env.VLM_API_KEY
            || '';
        // Some users forget to replace the placeholder `your_api_key`.
        const placeholderPatterns = [
            'your_api_key', 'your-api-key', 'your api key',
            '<api_key>', '<your_key>', '<your-api-key>',
            'api_key_here', 'sk-placeholder', 'placeholder'
        ];
        const looksLikePlaceholder = !apiKey
            || placeholderPatterns.some(p => apiKey.toLowerCase().includes(p));
        if (looksLikePlaceholder) {
            throw new ApiError('VLM_API_KEY (or OPENAI_<FAMILY>_API_KEY) environment variable is required, please set your actual API key');
        }

        // ---- Resolve model ----
        const model = (groupPrefix && env[`${groupPrefix}_MODEL`])
            || env.VLM_VISION_MODEL
            || env.VISION_MODEL;

        return {
            VLM_BASE_URL: baseUrl,
            VLM_API_KEY: apiKey,
            VLM_VISION_MODEL: model,
            VLM_VISION_MODEL_TEMPERATURE: env.VLM_VISION_MODEL_TEMPERATURE || env.VISION_MODEL_TEMPERATURE,
            VLM_VISION_MODEL_TOP_P: env.VLM_VISION_MODEL_TOP_P || env.VISION_MODEL_TOP_P,
            VLM_VISION_MODEL_MAX_TOKENS: env.VLM_VISION_MODEL_MAX_TOKENS || env.VISION_MODEL_MAX_TOKENS,
            VLM_TIMEOUT: env.VLM_TIMEOUT || env.REQUEST_TIMEOUT,
            VLM_RETRY_COUNT: env.VLM_RETRY_COUNT || env.RETRY_COUNT,
            VLM_PROVIDER: providerKind,
            PROVIDER: env.PROVIDER,
            VLM_ANTHROPIC_VERSION: env.VLM_ANTHROPIC_VERSION || env.ANTHROPIC_VERSION,
            SERVER_NAME: env.SERVER_NAME,
            SERVER_VERSION: env.SERVER_VERSION
        };
    }

    /**
     * Resolve the full request URL for the active provider family.
     */
    private resolveRequestUrl(): string {
        const config = this.getConfig();
        const baseUrl = config.VLM_BASE_URL.replace(/\/+$/, '');
        const providerKind = (config.VLM_PROVIDER || 'auto').toLowerCase();

        // If the base URL already ends with a known endpoint path, use as-is.
        if (/\/(chat\/completions|responses|messages)$/.test(baseUrl)) {
            return baseUrl;
        }
        switch (providerKind) {
            case 'responses':
            case 'response':
                return `${baseUrl}/responses`;
            case 'anthropic':
            case 'claude':
                // Anthropic canonical path; allow override if base already includes v1
                return /\/v1$/.test(baseUrl) ? `${baseUrl}/messages` : `${baseUrl}/v1/messages`;
            case 'chat-completions':
            case 'chatcompletions':
            case 'openai':
            default:
                return `${baseUrl}/chat/completions`;
        }
    }

    /**
     * Get server configuration
     */
    getServerConfig() {
        const config = this.getConfig();
        return {
            name: config.SERVER_NAME || 'vlm-mcp-server',
            version: config.SERVER_VERSION || '0.1.0'
        };
    }

    /**
     * Get vision (model + request) configuration
     */
    getVisionConfig() {
        const config = this.getConfig();
        return {
            model: config.VLM_VISION_MODEL || 'glm-4.6v',
            timeout: parseInt(config.VLM_TIMEOUT || '300000'),
            retryCount: parseInt(config.VLM_RETRY_COUNT || '1'),
            url: this.resolveRequestUrl(),
            temperature: parseFloat(config.VLM_VISION_MODEL_TEMPERATURE || '0.8'),
            topP: parseFloat(config.VLM_VISION_MODEL_TOP_P || '0.6'),
            maxTokens: parseInt(config.VLM_VISION_MODEL_MAX_TOKENS || '32768')
        };
    }

    /**
     * Get the Anthropic API version header value.
     */
    getAnthropicVersion(): string {
        return this.getConfig().VLM_ANTHROPIC_VERSION || '2023-06-01';
    }

    /**
     * Get API key from configuration
     */
    getApiKey() {
        return this.getConfig().VLM_API_KEY;
    }
}

/**
 * Global environment service instance
 */
export const environmentService = EnvironmentService.getInstance();
/**
 * Configuration service instance (for backward compatibility)
 */
export const configurationService = environmentService;
