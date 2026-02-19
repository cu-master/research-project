import { AsyncLocalStorage } from "node:async_hooks";

export type LangChainRequestContext = {
  sessionId?: string;
  projectId?: string;
  userId?: string;
};

const als = new AsyncLocalStorage<LangChainRequestContext>();

export function runWithLangChainRequestContext<T>(
  context: LangChainRequestContext,
  fn: () => Promise<T>
): Promise<T> {
  return als.run(context, fn);
}

export function getLangChainRequestContext(): LangChainRequestContext {
  return als.getStore() ?? {};
}

