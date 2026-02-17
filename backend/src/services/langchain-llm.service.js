import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { env } from "../config/env.js";
import { store } from "../data/store.js";

const pickApiKey = (model) => {
  if (model.apiKey) {
    return model.apiKey;
  }
  if (model.provider === "OPENAI") {
    return env.openaiApiKey;
  }
  if (model.provider === "GEMINI") {
    return env.geminiApiKey || env.googleApiKey;
  }
  if (model.provider === "CLAUDE") {
    return env.anthropicApiKey;
  }
  return "";
};

const buildClient = (model) => {
  const apiKey = pickApiKey(model);
  if (!apiKey) {
    throw new Error(`模型 ${model.name || model.id} 缺少 API Key`);
  }

  const common = {
    model: model.modelId,
    temperature: model.temperature ?? 0.2,
    maxTokens: model.maxTokens || 1024
  };

  if (model.provider === "OPENAI") {
    return new ChatOpenAI({
      ...common,
      apiKey,
      configuration: model.baseUrl ? { baseURL: model.baseUrl } : undefined
    });
  }

  if (model.provider === "GEMINI") {
    return new ChatGoogleGenerativeAI({
      ...common,
      apiKey
    });
  }

  if (model.provider === "CLAUDE") {
    return new ChatAnthropic({
      ...common,
      apiKey,
      anthropicApiUrl: model.baseUrl || undefined
    });
  }

  throw new Error(`不支持的模型提供商: ${model.provider}`);
};

export const listConfiguredModels = () => {
  return store.listLlmModels();
};

export const runLlmCompletion = async ({ prompt, modelId, systemPrompt }) => {
  const model = modelId ? store.getLlmModelById(modelId) : store.getActiveLlmModel();
  if (!model) {
    throw new Error("未找到可用模型配置，请先在系统管理中启用模型");
  }
  if (!model.modelId) {
    throw new Error(`模型 ${model.name || model.id} 未配置 modelId`);
  }

  const client = buildClient(model);
  const messages = [];
  const finalSystemPrompt = systemPrompt || model.systemPrompt;
  if (finalSystemPrompt) {
    messages.push(new SystemMessage(finalSystemPrompt));
  }
  messages.push(new HumanMessage(prompt));

  const result = await client.invoke(messages);
  const text = typeof result.content === "string"
    ? result.content
    : Array.isArray(result.content)
      ? result.content.map((it) => (typeof it === "string" ? it : it?.text || "")).join("\n")
      : "";

  return {
    model: {
      id: model.id,
      name: model.name,
      provider: model.provider,
      modelId: model.modelId
    },
    output: text
  };
};
