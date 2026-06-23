export type ProviderId = "openai" | "anthropic" | "google" | "ollama";

export interface ProviderConfig {
  id: ProviderId;
  name: string;
  models: { id: string; name: string }[];
  requiresKey: boolean;
  requiresBaseUrl?: boolean;
  baseUrlPlaceholder?: string;
  modelIsEditable?: boolean;
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
    models: [{ id: "", name: "Modelo personalizado" }],
    requiresKey: true,
    requiresBaseUrl: true,
    baseUrlPlaceholder: "http://localhost:11434/v1",
    modelIsEditable: true,
  },
];
