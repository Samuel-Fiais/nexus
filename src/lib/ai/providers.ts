export interface RuntimeProvider {
  id: "openai" | "anthropic" | "google";
  envKey?: string;
}

export const openai: RuntimeProvider = {
  id: "openai",
  envKey: "OPENAI_API_KEY",
};

export const anthropic: RuntimeProvider = {
  id: "anthropic",
  envKey: "ANTHROPIC_API_KEY",
};

export const google: RuntimeProvider = {
  id: "google",
  envKey: "GOOGLE_GENERATIVE_AI_API_KEY",
};
