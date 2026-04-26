/**
 * dynamic-models.test.ts
 *
 * 验证动态模型加载的三条路径：
 *   1. 远端成功 → 模型写入 store 并持久化缓存
 *   2. 远端失败 + 缓存存在 → 从缓存加载
 *   3. 远端失败 + 无缓存 → 保留静态 DEFAULT_MODELS（不调用 mergeModels）
 *
 * 以及 isModelNotavailableInServer 对动态（非 DEFAULT_MODELS 内）模型的行为。
 */

// Mock app/client/api to avoid the nanoid ESM dependency chain in tests.
// getHeaders is the only runtime value we need; LLMModel is a type and is erased.
jest.mock("../app/client/api", () => ({
  getHeaders: () => ({ Authorization: "Bearer test-key" }),
}));

import { fetchRemoteModels, isChatModel, REMOTE_MODELS_CACHE_KEY } from "../app/utils/fetch-models";
import { isModelNotavailableInServer } from "../app/utils/model";
import { LLMModel } from "../app/client/api";

// ---------- helpers ----------

function makeModel(id: string): LLMModel {
  return {
    name: id,
    displayName: id,
    available: true,
    sorted: 1000,
    provider: { id: "openai", providerName: "OpenAI", providerType: "openai", sorted: 1 },
  };
}

function mockFetchSuccess(ids: string[]) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ data: ids.map((id) => ({ id, object: "model" })) }),
  } as unknown as Response);
}

function mockFetchFailure() {
  (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));
}

beforeEach(() => {
  localStorage.clear();
  (global.fetch as jest.Mock).mockReset();
});

// ---------- isChatModel filter ----------

describe("isChatModel", () => {
  test("accepts regular chat models", () => {
    expect(isChatModel("gpt-4o")).toBe(true);
    expect(isChatModel("claude-3-5-sonnet-20241022")).toBe(true);
    expect(isChatModel("qwen-plus-0919")).toBe(true);
    expect(isChatModel("deepseek-chat")).toBe(true);
  });

  test("rejects non-chat models", () => {
    expect(isChatModel("text-embedding-ada-002")).toBe(false);
    expect(isChatModel("tts-1")).toBe(false);
    expect(isChatModel("whisper-1")).toBe(false);
    expect(isChatModel("dall-e-3")).toBe(false);
    expect(isChatModel("text-moderation-latest")).toBe(false);
  });
});

// ---------- fetchRemoteModels: 三条路径 ----------

describe("fetchRemoteModels — remote success path", () => {
  test("calls mergeModels with mapped LLMModel[] and caches to localStorage", async () => {
    mockFetchSuccess(["gpt-4o", "claude-3-5-sonnet-20241022", "text-embedding-ada-002"]);

    const mergeModels = jest.fn();
    const source = await fetchRemoteModels(mergeModels);

    expect(source).toBe("remote");
    expect(mergeModels).toHaveBeenCalledTimes(1);

    const [called] = mergeModels.mock.calls[0] as [LLMModel[]];
    // text-embedding-ada-002 should be filtered out
    expect(called.map((m) => m.name)).toEqual(["gpt-4o", "claude-3-5-sonnet-20241022"]);
    expect(called[0].provider.providerName).toBe("OpenAI");

    // localStorage cache must be set
    const cached = JSON.parse(localStorage.getItem(REMOTE_MODELS_CACHE_KEY) ?? "null");
    expect(cached).toHaveLength(2);
  });
});

describe("fetchRemoteModels — cache fallback path", () => {
  test("loads from localStorage when remote fetch fails", async () => {
    mockFetchFailure();

    const cachedModels: LLMModel[] = [makeModel("gpt-4o-cached")];
    localStorage.setItem(REMOTE_MODELS_CACHE_KEY, JSON.stringify(cachedModels));

    const mergeModels = jest.fn();
    const source = await fetchRemoteModels(mergeModels);

    expect(source).toBe("cache");
    expect(mergeModels).toHaveBeenCalledTimes(1);
    const [called] = mergeModels.mock.calls[0] as [LLMModel[]];
    expect(called[0].name).toBe("gpt-4o-cached");
  });
});

describe("fetchRemoteModels — static DEFAULT_MODELS fallback path", () => {
  test("does not call mergeModels when remote fails and no cache exists", async () => {
    mockFetchFailure();
    // localStorage is empty (cleared in beforeEach)

    const mergeModels = jest.fn();
    const source = await fetchRemoteModels(mergeModels);

    expect(source).toBe("default");
    expect(mergeModels).not.toHaveBeenCalled();
  });
});

// ---------- isModelNotavailableInServer: 动态模型语义 ----------

describe("isModelNotavailableInServer — dynamic models", () => {
  test("allows dynamic model (not in DEFAULT_MODELS) when no customModels restrictions", () => {
    // qwen-plus-0919 is not in DEFAULT_MODELS
    const result = isModelNotavailableInServer("", "qwen-plus-0919", "OpenAI");
    expect(result).toBe(false);
  });

  test("allows dynamic model even when -all is set (not explicitly blocked)", () => {
    // -all disables all DEFAULT_MODELS, but dynamic model not in table → pass through
    const result = isModelNotavailableInServer("-all", "qwen-plus-0919", "OpenAI");
    expect(result).toBe(false);
  });

  test("blocks dynamic model when explicitly added with minus prefix", () => {
    // Operator explicitly blocks the model via customModels
    const result = isModelNotavailableInServer(
      "-all,qwen-plus-0919",
      "qwen-plus-0919",
      "qwen-plus-0919", // provider-unspecified pattern used by common.ts
    );
    // -all disables everything; then "+qwen-plus-0919" re-enables it. But here there is
    // no "+" re-enable — the customModels is "-all,qwen-plus-0919" where the second entry
    // has no prefix, meaning it ENABLES the model. So the expected result is false.
    // Change to verify that an EXPLICITLY disabled dynamic model IS blocked:
    const resultBlocked = isModelNotavailableInServer(
      "-qwen-plus-0919",
      "qwen-plus-0919",
      "qwen-plus-0919",
    );
    expect(resultBlocked).toBe(true);
  });

  test("still allows known DEFAULT_MODELS model when no restriction", () => {
    delete process.env.DISABLE_GPT4;
    const result = isModelNotavailableInServer("", "gpt-4o", "OpenAI");
    expect(result).toBe(false);
  });
});
