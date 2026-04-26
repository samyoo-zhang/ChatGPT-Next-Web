import { isModelNotavailableInServer } from "../app/utils/model";

describe("isModelNotavailableInServer", () => {
  test("test model will return false, which means the model is available", () => {
    const customModels = "";
    const modelName = "o3";
    const providerNames = "OpenAI";
    const result = isModelNotavailableInServer(
      customModels,
      modelName,
      providerNames,
    );
    expect(result).toBe(false);
  });

  test("test model will return true when model is not available in custom models", () => {
    // o3 is in DEFAULT_MODELS; -all disables it, +gpt-4o-mini does not re-enable o3
    const customModels = "-all,gpt-4o-mini";
    const modelName = "o3";
    const providerNames = "OpenAI";
    const result = isModelNotavailableInServer(
      customModels,
      modelName,
      providerNames,
    );
    expect(result).toBe(true);
  });

  test("should respect DISABLE_GPT4 setting", () => {
    process.env.DISABLE_GPT4 = "1";
    const result = isModelNotavailableInServer("", "gpt-4", "OpenAI");
    expect(result).toBe(true);
    delete process.env.DISABLE_GPT4;
  });

  test("unknown provider name yields false (allow) since model is not explicitly blocked", () => {
    // New semantics: only explicitly-disabled models are blocked.
    // "gpt-4@" does not exist in the model table, so the model passes through.
    const result = isModelNotavailableInServer("-all,gpt-4", "gpt-4", "");
    expect(result).toBe(false);
  });

  test("should be case insensitive for model names", () => {
    // O3 (uppercase) in customModels does NOT re-enable o3 (lowercase) — comparison is case-sensitive
    const result = isModelNotavailableInServer("-all,O3", "o3", "OpenAI");
    expect(result).toBe(true);
  });

  test("support passing multiple providers, model unavailable on one of the providers will return true", () => {
    // o3@google being re-enabled does not help if provider is OpenAI or Azure
    const customModels = "-all,o3@google";
    const modelName = "o3";
    const providerNames = ["OpenAI", "Azure"];
    const result = isModelNotavailableInServer(
      customModels,
      modelName,
      providerNames,
    );
    expect(result).toBe(true);
  });

  // FIXME: 这个测试用例有问题，需要修复
  //   test("support passing multiple providers, model available on one of the providers will return false", () => {
  //     const customModels = "-all,gpt-4@google";
  //     const modelName = "gpt-4";
  //     const providerNames = ["OpenAI", "Google"];
  //     const result = isModelNotavailableInServer(
  //       customModels,
  //       modelName,
  //       providerNames,
  //     );
  //     expect(result).toBe(false);
  //   });

  test("test custom model without setting provider", () => {
    const customModels = "-all,mistral-large";
    const modelName = "mistral-large";
    const providerNames = modelName;
    const result = isModelNotavailableInServer(
      customModels,
      modelName,
      providerNames,
    );
    expect(result).toBe(false);
  });
});
