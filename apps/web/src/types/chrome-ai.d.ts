// Chrome 내장 Prompt API (LanguageModel) 최소 선언. 쓰는 부분만 적었다.
type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelIO {
  type: 'text';
  languages?: string[];
}
interface LanguageModelCreateCoreOptions {
  expectedInputs?: LanguageModelIO[];
  expectedOutputs?: LanguageModelIO[];
}
interface LanguageModelPrompt {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
interface LanguageModelCreateOptions extends LanguageModelCreateCoreOptions {
  initialPrompts?: LanguageModelPrompt[];
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
}
interface LanguageModelSession {
  prompt(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}
interface LanguageModelStatic {
  availability(options?: LanguageModelCreateCoreOptions): Promise<LanguageModelAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare var LanguageModel: LanguageModelStatic | undefined;
