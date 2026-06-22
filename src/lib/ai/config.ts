export type ProviderId = "openai" | "anthropic" | "google" | "custom" | "ollama";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  models: { id: string; name: string }[];
  requiresKey: boolean;
  requiresBaseUrl?: boolean;
  baseUrlPlaceholder?: string;
}

export const AVAILABLE_PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "o3-mini", name: "O3 Mini" },
    ],
    requiresKey: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-haiku-3-5", name: "Claude Haiku 3.5" },
    ],
    requiresKey: true,
  },
  {
    id: "google",
    name: "Google",
    models: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-pro", name: "Gemini 2.0 Pro" },
    ],
    requiresKey: true,
  },
  {
    id: "ollama",
    name: "Ollama",
    models: [
      { id: "llama3.2", name: "Llama 3.2" },
      { id: "llama3.1", name: "Llama 3.1" },
      { id: "mistral", name: "Mistral" },
      { id: "codellama", name: "CodeLlama" },
      { id: "phi4", name: "Phi-4" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
      { id: "qwen2.5", name: "Qwen 2.5" },
      { id: "gemma2", name: "Gemma 2" },
      { id: "custom-model", name: "Outro modelo" },
    ],
    requiresKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://localhost:11434/v1",
  },
  {
    id: "custom",
    name: "Custom (OpenAI-compatible)",
    models: [{ id: "custom-model", name: "Custom Model" }],
    requiresKey: false,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://localhost:11434/v1",
  },
];
