import { ENV } from "./env";

// ─── Public types (unchanged interface — callers are not affected) ─────────────

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: { name: string };
};
export type ToolChoice = ToolChoicePrimitive | ToolChoiceByName | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  /** Override the default model (claude-sonnet-4-6). Use sparingly — only for tasks that require higher precision. */
  model?: string;
  /**
   * Enable extended thinking. Pass `{ budget_tokens: N }` (minimum 1024).
   * Omit or pass `false` to disable (default).
   */
  thinking?: { budget_tokens: number } | false;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

// ─── Internal Anthropic types ─────────────────────────────────────────────────

type AnthropicImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string };

type AnthropicContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentPart[];
};

type AnthropicTool = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "none" }
  | { type: "any" }
  | { type: "tool"; name: string };

type AnthropicResponseBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

type AnthropicResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicResponseBlock[];
  model: string;
  stop_reason: string;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ensureArray = (value: MessageContent | MessageContent[]): MessageContent[] =>
  Array.isArray(value) ? value : [value];

function convertImageForAnthropic(part: ImageContent): AnthropicContentPart {
  const url = part.image_url.url;
  if (url.startsWith("data:")) {
    const commaIdx = url.indexOf(",");
    const header = url.slice(5, commaIdx); // e.g. "image/jpeg;base64"
    const media_type = header.split(";")[0] ?? "image/jpeg";
    const data = url.slice(commaIdx + 1);
    return { type: "image", source: { type: "base64", media_type, data } };
  }
  return { type: "image", source: { type: "url", url } };
}

function convertContentForAnthropic(part: MessageContent): AnthropicContentPart | null {
  if (typeof part === "string") return { type: "text", text: part };
  if (part.type === "text") return { type: "text", text: part.text };
  if (part.type === "image_url") return convertImageForAnthropic(part);
  if (part.type === "file_url") {
    console.warn("[LLM] file_url content is not supported by Anthropic API — skipping part");
    return null;
  }
  return null;
}

function buildAnthropicMessages(messages: Message[]): {
  system: string | undefined;
  anthropicMessages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      const text = ensureArray(msg.content)
        .map((p) => (typeof p === "string" ? p : p.type === "text" ? p.text : ""))
        .join("\n");
      if (text) systemParts.push(text);
      continue;
    }

    if (msg.role === "tool" || msg.role === "function") {
      // Tool results in Anthropic format
      const content = ensureArray(msg.content)
        .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
        .join("\n");
      anthropicMessages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: msg.tool_call_id ?? msg.name ?? "", content }],
      });
      continue;
    }

    const role = msg.role as "user" | "assistant";
    const parts = ensureArray(msg.content);
    const converted = parts.map(convertContentForAnthropic).filter((p): p is AnthropicContentPart => p !== null);

    if (converted.length === 1 && converted[0].type === "text") {
      anthropicMessages.push({ role, content: converted[0].text });
    } else if (converted.length > 0) {
      anthropicMessages.push({ role, content: converted });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    anthropicMessages,
  };
}

function convertToolsForAnthropic(tools: Tool[]): AnthropicTool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));
}

function convertToolChoiceForAnthropic(
  tc: ToolChoice | undefined,
  tools: Tool[] | undefined
): AnthropicToolChoice | undefined {
  if (!tc) return undefined;
  if (tc === "none") return { type: "none" };
  if (tc === "auto") return { type: "auto" };
  if (tc === "required") return { type: "any" };
  if ("name" in tc) return { type: "tool", name: tc.name };
  if ("type" in tc && tc.type === "function") return { type: "tool", name: tc.function.name };
  return undefined;
}

function wantsJson(params: InvokeParams): boolean {
  const fmt = params.responseFormat ?? params.response_format;
  return fmt?.type === "json_object" || fmt?.type === "json_schema";
}

function getJsonSchema(params: InvokeParams): JsonSchema | undefined {
  const fmt = params.responseFormat ?? params.response_format;
  return fmt?.type === "json_schema" ? fmt.json_schema : undefined;
}

function injectJsonInstruction(messages: AnthropicMessage[], schema?: JsonSchema): AnthropicMessage[] {
  let instruction = "Responda apenas com JSON válido, sem markdown e sem blocos de código.";
  if (schema) {
    instruction += `\n\nO JSON deve seguir exatamente esta estrutura (sem campos extras):\n${JSON.stringify(schema.schema, null, 2)}`;
  }
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") {
    return [...messages, { role: "user", content: instruction }];
  }
  const updated: AnthropicMessage = {
    role: "user",
    content:
      typeof last.content === "string"
        ? `${last.content}\n\n${instruction}`
        : [
            ...(last.content as AnthropicContentPart[]),
            { type: "text", text: instruction },
          ],
  };
  return [...messages.slice(0, -1), updated];
}

function mapAnthropicResponseToInvokeResult(resp: AnthropicResponse): InvokeResult {
  const textParts = resp.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text);

  const toolUseParts = resp.content.filter(
    (b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } =>
      b.type === "tool_use"
  );

  const toolCalls: ToolCall[] = toolUseParts.map((b) => ({
    id: b.id,
    type: "function",
    function: { name: b.name, arguments: JSON.stringify(b.input) },
  }));

  return {
    id: resp.id,
    created: Math.floor(Date.now() / 1000),
    model: resp.model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: textParts.join("\n"),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: resp.stop_reason ?? null,
      },
    ],
    usage: {
      prompt_tokens: resp.usage.input_tokens,
      completion_tokens: resp.usage.output_tokens,
      total_tokens: resp.usage.input_tokens + resp.usage.output_tokens,
    },
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  if (!ENV.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const { messages, tools, toolChoice, tool_choice, maxTokens, max_tokens, model, thinking } = params;

  const { system, anthropicMessages: rawMessages } = buildAnthropicMessages(messages);

  // Inject JSON instruction when json_object/json_schema mode is requested (Anthropic has no response_format)
  const finalMessages = wantsJson(params) ? injectJsonInstruction(rawMessages, getJsonSchema(params)) : rawMessages;

  const payload: Record<string, unknown> = {
    model: model ?? "claude-sonnet-4-6",
    max_tokens: maxTokens ?? max_tokens ?? 32768,
    messages: finalMessages,
  };

  if (system) payload.system = system;

  // Extended thinking — minimum budget 1024 for Anthropic, disabled by default
  if (thinking) {
    payload.thinking = {
      type: "enabled",
      budget_tokens: Math.max(1024, thinking.budget_tokens),
    };
  }

  if (tools && tools.length > 0) {
    payload.tools = convertToolsForAnthropic(tools);
    const tc = convertToolChoiceForAnthropic(toolChoice ?? tool_choice, tools);
    if (tc) payload.tool_choice = tc;
  }

  // 300s timeout — long-running analysis with large prompts
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300_000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ENV.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error(
        "A análise demorou mais de 5 minutos. Tente novamente com uma imagem menor ou com menos campanhas visíveis."
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const isHtml = errorText.trim().startsWith("<");
    if (isHtml) {
      throw new Error(
        `LLM invoke failed: ${response.status} ${response.statusText} – O servidor retornou uma página de erro HTML (gateway/proxy). Tente novamente em alguns instantes.`
      );
    }
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const rawText = await response.text();
    const isHtml = rawText.trim().startsWith("<");
    if (isHtml) {
      throw new Error(
        `LLM invoke retornou HTML em vez de JSON (status ${response.status}). O gateway pode estar sobrecarregado. Tente novamente.`
      );
    }
    throw new Error(
      `LLM invoke retornou content-type inesperado: ${contentType}. Resposta: ${rawText.slice(0, 200)}`
    );
  }

  const anthropicResp = (await response.json()) as AnthropicResponse;
  return mapAnthropicResponseToInvokeResult(anthropicResp);
}

/**
 * Extract the text content from an InvokeResult.
 * Works for both string content and array content (thinking responses return content as array).
 */
export function extractTextContent(result: InvokeResult): string {
  const content = result?.choices?.[0]?.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((part): part is TextContent => part.type === "text")
      .map((part) => part.text)
      .join("\n");
  }
  return String(content);
}
