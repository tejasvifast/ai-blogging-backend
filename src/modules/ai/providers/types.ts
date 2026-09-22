export type AIProviderName = 'anthropic' | 'openai'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GenerateParams {
  system?: string | undefined
  messages: ChatMessage[]
  /** Provider-specific model id. Falls back to the provider default. */
  model?: string | undefined
  maxTokens?: number | undefined
  /** Only sent to models that support sampling (Haiku 4.5, GPT-4o-mini). */
  temperature?: number | undefined
}

export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface GenerateResult {
  text: string
  provider: AIProviderName
  model: string
  usage: TokenUsage
}

export interface AIProvider {
  readonly name: AIProviderName
  /** Default model when the caller doesn't specify one. */
  readonly defaultModel: string
  /** True when the provider has an API key configured. */
  isConfigured(): boolean
  generate(params: GenerateParams): Promise<GenerateResult>
}
