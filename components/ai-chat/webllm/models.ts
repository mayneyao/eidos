// copy from https://github.com/mlc-ai/web-llm/blob/main/src/config.ts#L241
// just for reduce the size of the bundle

export const modelVersion = "v0_2_39"
export const modelLibURLPrefix =
  "https://raw.githubusercontent.com/mlc-ai/binary-mlc-llm-libs/main/web-llm-models/"

export const WEB_LLM_MODELS = [
  // Llama-3
  {
    model: "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f32_1-MLC",
    model_id: "Llama-3-8B-Instruct-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 5295.7,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC",
    model_id: "Llama-3-8B-Instruct-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 4598.34,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f32_1-MLC",
    model_id: "Llama-3-8B-Instruct-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 6101.01,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-3-8B-Instruct-q4f16_1-MLC",
    model_id: "Llama-3-8B-Instruct-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 5001.0,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-3-70B-Instruct-q3f16_1-MLC",
    model_id: "Llama-3-70B-Instruct-q3f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-70B-Instruct-q3f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 31153.13,
    low_resource_required: false,
  },
  // Phi3-mini-instruct
  {
    model: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC",
    model_id: "Phi-3-mini-4k-instruct-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Phi-3-mini-4k-instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 3672.07,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f32_1-MLC",
    model_id: "Phi-3-mini-4k-instruct-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Phi-3-mini-4k-instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 5483.12,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f16_1-MLC",
    model_id: "Phi-3-mini-4k-instruct-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Phi-3-mini-4k-instruct-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2520.07,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/Phi-3-mini-4k-instruct-q4f32_1-MLC",
    model_id: "Phi-3-mini-4k-instruct-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Phi-3-mini-4k-instruct-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 3179.12,
    low_resource_required: true,
  },
  // Llama-2
  {
    model: "https://huggingface.co/mlc-ai/Llama-2-7b-chat-hf-q4f32_1-MLC",
    model_id: "Llama-2-7b-chat-hf-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-2-7b-chat-hf-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 5284.01,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-2-7b-chat-hf-q4f16_1-MLC",
    model_id: "Llama-2-7b-chat-hf-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-2-7b-chat-hf-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 4618.52,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-2-7b-chat-hf-q4f32_1-MLC",
    model_id: "Llama-2-7b-chat-hf-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-2-7b-chat-hf-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 9109.03,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-2-7b-chat-hf-q4f16_1-MLC",
    model_id: "Llama-2-7b-chat-hf-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-2-7b-chat-hf-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 6749.02,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/Llama-2-13b-chat-hf-q4f16_1-MLC",
    model_id: "Llama-2-13b-chat-hf-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-2-13b-chat-hf-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 11814.09,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  // Mistral variants
  {
    model: "https://huggingface.co/mlc-ai/WizardMath-7B-V1.1-q4f16_1-MLC",
    model_id: "WizardMath-7B-V1.1-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Mistral-7B-Instruct-v0.2-q4f16_1-sw4k_cs1k-webgpu.wasm",
    vram_required_MB: 6079.02,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/Mistral-7B-Instruct-v0.2-q4f16_1-MLC",
    model_id: "Mistral-7B-Instruct-v0.2-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Mistral-7B-Instruct-v0.2-q4f16_1-sw4k_cs1k-webgpu.wasm",
    vram_required_MB: 6079.02,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model:
      "https://huggingface.co/mlc-ai/OpenHermes-2.5-Mistral-7B-q4f16_1-MLC",
    model_id: "OpenHermes-2.5-Mistral-7B-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Mistral-7B-Instruct-v0.2-q4f16_1-sw4k_cs1k-webgpu.wasm",
    vram_required_MB: 6079.02,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model:
      "https://huggingface.co/mlc-ai/NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
    model_id: "NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Mistral-7B-Instruct-v0.2-q4f16_1-sw4k_cs1k-webgpu.wasm",
    vram_required_MB: 6079.02,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  // Hermes-2 Pro
  {
    model: "https://huggingface.co/mlc-ai/Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    model_id: "Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 4976.13,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC",
    model_id: "Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Llama-3-8B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 6051.27,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
    model_id: "Hermes-2-Pro-Mistral-7B-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Mistral-7B-Instruct-v0.2-q4f16_1-sw4k_cs1k-webgpu.wasm",
    vram_required_MB: 4033.28,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  // Gemma-2B
  {
    model: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC",
    model_id: "gemma-2b-it-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/gemma-2b-it-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 1476.52,
    low_resource_required: false,
    buffer_size_required_bytes: 262144000,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f32_1-MLC",
    model_id: "gemma-2b-it-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/gemma-2b-it-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 1750.66,
    low_resource_required: false,
    buffer_size_required_bytes: 262144000,
  },
  {
    model: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f16_1-MLC",
    model_id: "gemma-2b-it-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/gemma-2b-it-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1476.52,
    low_resource_required: true,
    buffer_size_required_bytes: 262144000,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/gemma-2b-it-q4f32_1-MLC",
    model_id: "gemma-2b-it-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/gemma-2b-it-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1750.66,
    low_resource_required: true,
    buffer_size_required_bytes: 262144000,
  },
  // Qwen-1.5-1.8B
  {
    model: "https://huggingface.co/mlc-ai/Qwen1.5-1.8B-Chat-q4f16_1-MLC",
    model_id: "Qwen1.5-1.8B-Chat-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Qwen1.5-1.8B-Chat-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 2404.94,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Qwen1.5-1.8B-Chat-q4f32_1-MLC",
    model_id: "Qwen1.5-1.8B-Chat-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Qwen1.5-1.8B-Chat-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 3313.63,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/Qwen1.5-1.8B-Chat-q4f16_1-MLC",
    model_id: "Qwen1.5-1.8B-Chat-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Qwen1.5-1.8B-Chat-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1828.94,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/Qwen1.5-1.8B-Chat-q4f32_1-MLC",
    model_id: "Qwen1.5-1.8B-Chat-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/Qwen1.5-1.8B-Chat-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2161.63,
    low_resource_required: true,
  },
  // StableLM-zephyr-1.6B
  {
    model: "https://huggingface.co/mlc-ai/stablelm-2-zephyr-1_6b-q4f16_1-MLC",
    model_id: "stablelm-2-zephyr-1_6b-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/stablelm-2-zephyr-1_6b-q4f16_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 2087.66,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/stablelm-2-zephyr-1_6b-q4f32_1-MLC",
    model_id: "stablelm-2-zephyr-1_6b-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/stablelm-2-zephyr-1_6b-q4f32_1-ctx4k_cs1k-webgpu.wasm",
    vram_required_MB: 2999.33,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/stablelm-2-zephyr-1_6b-q4f16_1-MLC",
    model_id: "stablelm-2-zephyr-1_6b-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/stablelm-2-zephyr-1_6b-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1511.66,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/stablelm-2-zephyr-1_6b-q4f32_1-MLC",
    model_id: "stablelm-2-zephyr-1_6b-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/stablelm-2-zephyr-1_6b-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1847.33,
    low_resource_required: true,
  },
  // RedPajama
  {
    model:
      "https://huggingface.co/mlc-ai/RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC",
    model_id: "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/RedPajama-INCITE-Chat-3B-v1-q4f16_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 2972.09,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model:
      "https://huggingface.co/mlc-ai/RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC",
    model_id: "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/RedPajama-INCITE-Chat-3B-v1-q4f32_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 3928.09,
    low_resource_required: false,
  },
  {
    model:
      "https://huggingface.co/mlc-ai/RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC",
    model_id: "RedPajama-INCITE-Chat-3B-v1-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/RedPajama-INCITE-Chat-3B-v1-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2041.09,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model:
      "https://huggingface.co/mlc-ai/RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC",
    model_id: "RedPajama-INCITE-Chat-3B-v1-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/RedPajama-INCITE-Chat-3B-v1-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2558.09,
    low_resource_required: true,
  },
  // Phi-2
  {
    model: "https://huggingface.co/mlc-ai/phi-2-q4f16_1-MLC",
    model_id: "phi-2-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-2-q4f16_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 3053.97,
    low_resource_required: false,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-2-q4f32_1-MLC",
    model_id: "phi-2-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-2-q4f32_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 4032.48,
    low_resource_required: false,
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-2-q4f16_1-MLC",
    model_id: "phi-2-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-2-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2131.97,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-2-q4f32_1-MLC",
    model_id: "phi-2-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-2-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 2740.48,
    low_resource_required: true,
  },
  // Phi-1.5
  {
    model: "https://huggingface.co/mlc-ai/phi-1_5-q4f16_1-MLC",
    model_id: "phi-1_5-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-1_5-q4f16_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 1210.09,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-1_5-q4f32_1-MLC",
    model_id: "phi-1_5-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-1_5-q4f32_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 1682.09,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-1_5-q4f16_1-MLC",
    model_id: "phi-1_5-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-1_5-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1210.09,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/phi-1_5-q4f32_1-MLC",
    model_id: "phi-1_5-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/phi-1_5-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 1682.09,
    low_resource_required: true,
  },
  // TinyLlama
  {
    model: "https://huggingface.co/mlc-ai/TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
    model_id: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/TinyLlama-1.1B-Chat-v0.4-q4f16_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 697.24,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC",
    model_id: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/TinyLlama-1.1B-Chat-v0.4-q4f32_1-ctx2k_cs1k-webgpu.wasm",
    vram_required_MB: 839.98,
    low_resource_required: true,
  },
  {
    model: "https://huggingface.co/mlc-ai/TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC",
    model_id: "TinyLlama-1.1B-Chat-v0.4-q4f16_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/TinyLlama-1.1B-Chat-v0.4-q4f16_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 675.24,
    low_resource_required: true,
    required_features: ["shader-f16"],
  },
  {
    model: "https://huggingface.co/mlc-ai/TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC",
    model_id: "TinyLlama-1.1B-Chat-v0.4-q4f32_1-MLC-1k",
    model_lib:
      modelLibURLPrefix +
      modelVersion +
      "/TinyLlama-1.1B-Chat-v0.4-q4f32_1-ctx1k_cs1k-webgpu.wasm",
    vram_required_MB: 795.98,
    low_resource_required: true,
  },
]
