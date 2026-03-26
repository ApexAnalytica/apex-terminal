// ─── LLM Provider Abstraction ───────────────────────────────────
// Unified interface for streaming from multiple LLM providers

export type LLMProvider = "anthropic" | "gemini" | "ollama";

export interface StreamOptions {
  apiKey: string;
  model: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
}

export interface ProviderModelOption {
  value: string;
  label: string;
  provider: LLMProvider;
}

export const PROVIDER_MODELS: ProviderModelOption[] = [
  // Anthropic
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", provider: "anthropic" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic" },
  // Gemini
  { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash", provider: "gemini" },
  { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", provider: "gemini" },
  { value: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro", provider: "gemini" },
  // Ollama (local open-source)
  { value: "llama3.1:8b", label: "Llama 3.1 8B", provider: "ollama" },
  { value: "llama3.1:70b", label: "Llama 3.1 70B", provider: "ollama" },
  { value: "mistral:7b", label: "Mistral 7B", provider: "ollama" },
  { value: "mixtral:8x7b", label: "Mixtral 8x7B", provider: "ollama" },
  { value: "qwen2.5:7b", label: "Qwen 2.5 7B", provider: "ollama" },
  { value: "deepseek-r1:8b", label: "DeepSeek R1 8B", provider: "ollama" },
];

export function getModelsForProvider(provider: LLMProvider): ProviderModelOption[] {
  return PROVIDER_MODELS.filter((m) => m.provider === provider);
}

export function getProviderForModel(model: string): LLMProvider | null {
  return PROVIDER_MODELS.find((m) => m.value === model)?.provider ?? null;
}

export function getDefaultModel(provider: LLMProvider): string {
  switch (provider) {
    case "anthropic": return "claude-sonnet-4-20250514";
    case "gemini": return "gemini-2.5-flash-preview-05-20";
    case "ollama": return "llama3.1:8b";
  }
}
