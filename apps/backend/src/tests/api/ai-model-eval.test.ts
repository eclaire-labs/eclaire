import { describe, it } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
} from "../utils/test-helpers.js";

// Create authenticated fetch function
const loggedFetch = createAuthenticatedFetch(TEST_API_KEY);

// Type definitions for the prompt API response
interface PromptResponse {
  status: string;
  requestId: string;
  type: "text_response";
  response: string;
}

interface ModelEvalResult {
  modelName: string;
  provider: string;
  baseURL: string;
  totalTimeMs: number;
  aiResponseTimeMs: number;
  toolCallsCount: number;
  aiCallsCount: number;
  maxContextSize?: number;
  finalResponse: string;
  error?: string;
  success: boolean;
}

// Model configurations for testing (placeholders - fill these in with real configs)
const MODEL_CONFIGS = [
  // {
  //   name: "gemma3-4b-it-qat",
  //   description: "unsloth/gemma-3-4b-it-qat-GGUF:Q5_K_M",
  //   config: {
  //     BACKEND_AI_PROVIDER: "llamacpp",
  //     BACKEND_AI_BASE_URL: "http://localhost:11434/v1",
  //     BACKEND_AI_MODEL: "gemma3-4b-it-qat",
  //     // BACKEND_AI_API_KEY not needed for ollama
  //   },
  // },
  // {
  //   name: "gemma3-27b-it-qat",
  //   description: "unsloth/gemma-3-27b-it-qat-GGUF:Q4_K_M",
  //   config: {
  //     BACKEND_AI_PROVIDER: "llamacpp",
  //     BACKEND_AI_BASE_URL: "http://localhost:11434/v1",
  //     BACKEND_AI_MODEL: "gemma3-27b-it-qat",
  //     // BACKEND_AI_API_KEY not needed for llamacpp
  //   },
  // },
  // {
  //   name: "mistral-small-3.2-24b",
  //   description: "unsloth/Mistral-Small-3.2-24B-Instruct-2506-GGUF:Q5_K_M",
  //   config: {
  //     BACKEND_AI_PROVIDER: "llamacpp",
  //     BACKEND_AI_BASE_URL: "http://localhost:11434/v1",
  //     BACKEND_AI_MODEL: "mistral-small-3.2-24b",
  //     // BACKEND_AI_API_KEY not needed for llamacpp
  //   },
  // },
  {
    name: "qwen3-0.6b-gguf",
    description: "unsloth/Qwen3-0.6B-GGUF:Q5_K_M",
    config: {
      // Model selection now handled via activeModel in models.json
      // These overrides are for testing specific configurations
      BACKEND_AI_PROVIDER: "llamacpp",
      BACKEND_AI_MODEL: "qwen3-0.6b-gguf",
      // BACKEND_AI_API_KEY not needed for llamacpp
    },
  },
  // {
  //   name: "qwen3-30b-a3b-gguf",
  //   description: "unsloth/Qwen3-30B-A3B-GGUF:Q4_K_M",
  //   config: {
  //     BACKEND_AI_PROVIDER: "llamacpp",
  //     BACKEND_AI_BASE_URL: "http://localhost:11434/v1",
  //     BACKEND_AI_MODEL: "qwen3-30b-a3b-gguf",
  //     // BACKEND_AI_API_KEY not needed for llamacpp
  //   },
  // }
];

// Test prompts to evaluate (starting with simple "hey")
const TEST_PROMPTS = [
  "hey",
  // TODO: Add more prompts later for comprehensive evaluation
];

describe("Model Evaluation Integration Tests", () => {
  it("Model Performance Comparison - Simple Greeting", async () => {
    const prompt = TEST_PROMPTS[0]; // "hey"
    const results: ModelEvalResult[] = [];

    console.log(
      `\n🔬 Evaluating ${MODEL_CONFIGS.length} models with prompt: "${prompt}"`,
    );
    console.log("=" + "=".repeat(60));

    for (const modelConfig of MODEL_CONFIGS) {
      console.log(`\n🧪 Testing: ${modelConfig.name}`);

      try {
        await delay(500); // Small delay between requests to avoid overwhelming

        const requestBody = {
          prompt: prompt,
          aiConfig: modelConfig.config,
        };

        const startTime = Date.now();
        const response = await loggedFetch(`${BASE_URL}/prompt`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
          body: JSON.stringify(requestBody),
        });

        const totalTime = Date.now() - startTime;

        if (response.ok) {
          const data = (await response.json()) as PromptResponse;

          const config = modelConfig.config as Record<string, string>;
          const result: ModelEvalResult = {
            modelName: config.BACKEND_AI_MODEL || "unknown",
            provider: config.BACKEND_AI_PROVIDER || "unknown",
            baseURL: config.BACKEND_AI_BASE_URL || "unknown",
            totalTimeMs: totalTime,
            aiResponseTimeMs: 0,
            toolCallsCount: 0,
            aiCallsCount: 0,
            maxContextSize: undefined,
            finalResponse: data.response,
            success: true,
          };

          results.push(result);
          console.log(
            `✅ Success: ${result.totalTimeMs}ms total, ${result.aiResponseTimeMs}ms AI`,
          );
        } else {
          const errorText = await response.text();
          const result: ModelEvalResult = {
            modelName: modelConfig.config.BACKEND_AI_MODEL || "unknown",
            provider: modelConfig.config.BACKEND_AI_PROVIDER || "unknown",
            baseURL: "unknown",
            totalTimeMs: totalTime,
            aiResponseTimeMs: 0,
            toolCallsCount: 0,
            aiCallsCount: 0,
            finalResponse: "",
            error: `HTTP ${response.status}: ${errorText}`,
            success: false,
          };

          results.push(result);
          console.log(`❌ Failed: ${result.error}`);
        }
      } catch (error) {
        const result: ModelEvalResult = {
          modelName: modelConfig.config.BACKEND_AI_MODEL || "unknown",
          provider: modelConfig.config.BACKEND_AI_PROVIDER || "unknown",
          baseURL: "unknown",
          totalTimeMs: 0,
          aiResponseTimeMs: 0,
          toolCallsCount: 0,
          aiCallsCount: 0,
          finalResponse: "",
          error: error instanceof Error ? error.message : String(error),
          success: false,
        };

        results.push(result);
        console.log(`💥 Exception: ${result.error}`);
      }
    }

    // Display results in a nice table format
    console.log("\n📊 PERFORMANCE COMPARISON RESULTS");
    console.log("=" + "=".repeat(80));

    // Prepare data for console.table with key metrics
    const tableData = results.map((result, index) => ({
      "#": index + 1,
      Model: result.modelName,
      Provider: result.provider,
      Success: result.success ? "✅" : "❌",
      "Total Time (ms)": result.success ? result.totalTimeMs : "N/A",
      "AI Time (ms)": result.success ? result.aiResponseTimeMs : "N/A",
      "AI Calls": result.success ? result.aiCallsCount : "N/A",
      "Tool Calls": result.success ? result.toolCallsCount : "N/A",
      "Max Context": result.maxContextSize || "N/A",
      "Response Length": result.success ? result.finalResponse.length : "N/A",
      Error: result.error || "",
    }));

    console.table(tableData);

    // Additional analysis
    const successfulResults = results.filter((r) => r.success);
    if (successfulResults.length > 0) {
      console.log("\n📈 SUMMARY STATISTICS");
      console.log("-".repeat(40));

      const avgTotalTime =
        successfulResults.reduce((sum, r) => sum + r.totalTimeMs, 0) /
        successfulResults.length;
      const avgAiTime =
        successfulResults.reduce((sum, r) => sum + r.aiResponseTimeMs, 0) /
        successfulResults.length;
      const fastestModel = successfulResults.reduce((fastest, current) =>
        current.totalTimeMs < fastest.totalTimeMs ? current : fastest,
      );
      const slowestModel = successfulResults.reduce((slowest, current) =>
        current.totalTimeMs > slowest.totalTimeMs ? current : slowest,
      );

      console.log(`Average Total Time: ${avgTotalTime.toFixed(2)}ms`);
      console.log(`Average AI Time: ${avgAiTime.toFixed(2)}ms`);
      console.log(
        `Fastest Model: ${fastestModel.modelName} (${fastestModel.totalTimeMs}ms)`,
      );
      console.log(
        `Slowest Model: ${slowestModel.modelName} (${slowestModel.totalTimeMs}ms)`,
      );
      console.log(
        `Success Rate: ${successfulResults.length}/${results.length} (${Math.round((successfulResults.length / results.length) * 100)}%)`,
      );
    }

    // Also display actual responses for comparison
    console.log("\n💬 RESPONSE COMPARISON");
    console.log("-".repeat(50));
    successfulResults.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.modelName} (${result.provider})`);
      console.log(`Response: "${result.finalResponse}"`);
      console.log(`Length: ${result.finalResponse.length} chars`);
    });

    console.log("\n" + "=".repeat(80));
    console.log("Model evaluation completed!");
  }, 300000); // 5 minute timeout for the entire test
});
