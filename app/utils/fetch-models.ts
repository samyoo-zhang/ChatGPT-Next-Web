import { getHeaders, LLMModel } from "../client/api";
import { modelListRes } from "../components/mock/models";

export const REMOTE_MODELS_CACHE_KEY = "ablai-remote-models-cache";

/** 判断是否为聊天类模型（排除 embeddings / TTS / 图像等） */
export function isChatModel(id: string): boolean {
  return (
    !id.includes("embedding") &&
    !id.includes("-embed") &&
    !id.includes("tts") &&
    !id.includes("whisper") &&
    !id.includes("dall-e") &&
    !id.includes("babbage") &&
    !id.includes("davinci") &&
    !id.includes("moderation")
  );
}

/**
 * 从远端拉取模型列表，映射为 LLMModel[]，带 localStorage 缓存回退。
 *
 * 优先级：远端成功 → localStorage 缓存 → 静态 DEFAULT_MODELS（调用方保留）
 *
 * @param mergeModels  configStore.mergeModels 的引用，成功时调用
 * @returns 最终使用的模型来源描述（便于测试断言）
 */
export async function fetchRemoteModels(
  mergeModels: (models: LLMModel[]) => void,
): Promise<"remote" | "cache" | "default"> {
  try {
    console.log("show [Models] fetching from remote...", mergeModels);
    // const res = await fetch("/api/openai/v1/models", {
    //   method: "GET",
    //   headers: getHeaders(),
    // });
    // if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // const resJson = (await res.json()) as { data?: Array<{ id: string; created?: number; ground_name?: string }> };
    const resJson = modelListRes as {
      data?: Array<{ id: string; created?: number; ground_name?: string }>;
    };
    const chatData = (resJson.data ?? []).filter((m) => isChatModel(m.id));

    let seq = 1000;
    const models: LLMModel[] = chatData.map((m) => ({
      name: m.id,
      displayName: m.id,
      available: true,
      sorted: seq++,
      created: m.created,
      groundName: m.ground_name,
      provider: {
        id: "openai",
        providerName: "OpenAI",
        providerType: "openai",
        sorted: 1,
      },
    }));

    if (models.length > 0) {
      mergeModels(models);
      try {
        localStorage.setItem(REMOTE_MODELS_CACHE_KEY, JSON.stringify(models));
      } catch (_) {}
      return "remote";
    }
  } catch (e) {
    console.warn("[Models] remote fetch failed, trying cache...", e);
  }

  // 回退：尝试本地缓存
  try {
    const cached = localStorage.getItem(REMOTE_MODELS_CACHE_KEY);
    if (cached) {
      const models: LLMModel[] = JSON.parse(cached);
      if (models?.length > 0) {
        mergeModels(models);
        console.log("[Models] loaded from cache:", models.length);
        return "cache";
      }
    }
  } catch (_) {}

  // 最终兜底：configStore 中已有 DEFAULT_MODELS，调用方无需处理
  console.warn("[Models] using static DEFAULT_MODELS as fallback");
  return "default";
}
