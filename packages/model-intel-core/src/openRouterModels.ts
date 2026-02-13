export interface OpenRouterModel {
    id: string;
    name: string;
    description?: string;
    context_length?: number;
    pricing?: {
        prompt?: string;
        completion?: string;
    };
    architecture?: {
        modality?: string;
        tokenizer?: string;
        instruct_type?: string;
    };
    top_provider?: {
        max_completion_tokens?: number;
        is_moderated?: boolean;
    };
    supported_parameters?: string[];
    capabilities?: string[];
    supported_generation_methods?: string[];
}

export interface ParsedModel {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    inputPrice: number;
    outputPrice: number;
    modality?: string;
    description?: string;
    supportedParams?: string[];
    capabilities?: string[];
}

const PROVIDER_MAP: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    'meta-llama': 'Meta',
    mistralai: 'Mistral',
    cohere: 'Cohere',
    deepseek: 'DeepSeek',
    perplexity: 'Perplexity',
    'x-ai': 'xAI',
    amazon: 'Amazon',
    microsoft: 'Microsoft',
    nvidia: 'NVIDIA',
    qwen: 'Qwen',
    moonshotai: 'Moonshot AI',
    minimax: 'MiniMax',
    'z-ai': 'Z-AI',
};

export function extractProvider(modelId: string): string {
    const parts = modelId.split('/');
    if (parts.length < 2) return 'Unknown';

    const providerSlug = parts[0].toLowerCase();
    return PROVIDER_MAP[providerSlug] ||
        providerSlug.charAt(0).toUpperCase() + providerSlug.slice(1);
}

export function normalizeModality(modality?: string): string {
    if (!modality) return 'text->text';
    return modality.toLowerCase();
}

export function tokenPriceToMillionPrice(pricePerToken?: string): number {
    if (!pricePerToken) return 0;
    const price = parseFloat(pricePerToken);
    if (Number.isNaN(price)) return 0;
    return price * 1_000_000;
}

export function normalizeOpenRouterModel(model: OpenRouterModel): ParsedModel {
    return {
        id: model.id,
        name: model.name,
        provider: extractProvider(model.id),
        contextWindow: model.context_length ?? 0,
        inputPrice: tokenPriceToMillionPrice(model.pricing?.prompt),
        outputPrice: tokenPriceToMillionPrice(model.pricing?.completion),
        modality: normalizeModality(model.architecture?.modality),
        description: model.description,
        supportedParams: model.supported_parameters,
        capabilities: model.capabilities,
    };
}

export function supportsVision(modality?: string): boolean {
    const inputPart = modality?.split('->')[0] || '';
    return inputPart.includes('image');
}

export function supportsAudio(modality?: string): boolean {
    const inputPart = modality?.split('->')[0] || '';
    return inputPart.includes('audio');
}

export function supportsTools(supportedParams?: string[]): boolean {
    return supportedParams?.includes('tools') ?? false;
}

export function supportsImageGeneration(
    modality?: string,
    modelId?: string,
    modelName?: string,
    capabilities?: string[]
): boolean {
    if (capabilities && capabilities.length > 0) {
        const capLower = capabilities.map((c) => c.toLowerCase());
        if (capLower.some((c) => c.includes('image-generation') || c.includes('image') || c === 'images')) {
            return true;
        }
    }

    const outputPart = modality?.split('->')[1] || '';
    if (outputPart.includes('image')) return true;

    const lowerName = (modelName || '').toLowerCase();
    const lowerId = (modelId || '').toLowerCase();
    const combined = `${lowerName} ${lowerId}`;
    const imageGenKeywords = [
        'image', 'flux', 'dall-e', 'dalle', 'stable-diffusion', 'sd-', 'sdxl',
        'midjourney', 'imagen', 'ideogram', 'playground', 'kandinsky',
        'dreamshaper', 'deliberate', 'proteus', 'juggernaut',
    ];

    return imageGenKeywords.some((kw) => combined.includes(kw));
}

export function supportsFileInput(modality?: string, supportedParams?: string[]): boolean {
    return supportsVision(modality) || (supportedParams?.includes('file') ?? false);
}

export function supportsSearchCapability(
    modelId?: string,
    modelName?: string,
    capabilities?: string[],
    supportedParams?: string[]
): boolean {
    const capValues = (capabilities || []).map((c) => c.toLowerCase());
    const paramValues = (supportedParams || []).map((p) => p.toLowerCase());

    if (capValues.some((c) => c.includes('search') || c.includes('web') || c.includes('retrieval') || c.includes('browse'))) {
        return true;
    }

    if (paramValues.some((p) => p.includes('search') || p.includes('web') || p.includes('browse') || p.includes('retrieval'))) {
        return true;
    }

    const combined = `${modelId || ''} ${modelName || ''}`.toLowerCase();
    const keywords = ['sonar', 'perplexity', 'search', 'web-search', 'web search', 'retrieval', 'browse'];
    return keywords.some((kw) => combined.includes(kw));
}
