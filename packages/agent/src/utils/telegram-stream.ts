import type { Context } from "grammy";
import type { Agent } from "@mariozechner/pi-agent-core";

/**
 * Stream AI agent response to Telegram with batched updates
 */
export async function streamToTelegram(
  ctx: Context,
  agent: Agent,
  userMessage: string
): Promise<void> {
  let currentText = "";
  let lastUpdateTime = Date.now();
  let messageId: number | undefined;
  let isCompleted = false;
  const updateInterval = 500; // Update every 500ms to avoid rate limits

  // Subscribe to agent events
  const unsubscribe = agent.subscribe((event) => {
    if (event.type === "message_start") {
      const message = (event as any).message;
      console.log(`📡 Message Start [Role: ${message?.role}]`);
    }

    if (event.type === "message_update") {
      const message = (event as any).message;
      const msgEvent = event.assistantMessageEvent;

      // Only stream deltas from assistant messages
      if (message?.role === "assistant" && msgEvent.type === "text_delta") {
        currentText += msgEvent.delta;
      }
    } else if (event.type === "message_end") {
      const message = (event as any).message;
      console.log(
        `✅ Message End [Role: ${message?.role}]`
      );

      // If assistant message ends, sync text just in case deltas were missed
      if (message?.role === "assistant" && message?.content) {
        const fullText = message.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => (c as any).text)
          .join("");
        if (fullText && fullText.length > currentText.length) {
          currentText = fullText;
        }
      }
    } else if (event.type === "agent_end") {
      console.log(`🏁 Agent execution finished`);
      isCompleted = true;
    }
  });

  try {
    // Send initial "thinking" message
    const initialMsg = await ctx.reply("💭 思考中...");
    messageId = initialMsg.message_id;

    // Start the agent prompt
    console.log(`🚀 Sending prompt to agent: "${userMessage}"`);
    const promptPromise = agent
      .prompt(userMessage)
      .then(() => console.log("🏁 promptPromise resolved"))
      .catch((err: any) => {
        console.error("🔥 promptPromise rejected:", err);
        isCompleted = true;
      });

    // Update loop - periodically update the message
    const updateLoop = async () => {
      while (!isCompleted) {
        const now = Date.now();

        if (currentText && now - lastUpdateTime >= updateInterval) {
          try {
            if (messageId && currentText.length > 0) {
              await ctx.api.editMessageText(
                ctx.chat?.id!,
                messageId,
                currentText.substring(0, 4096),
                { parse_mode: undefined } // Plain text during stream for safety
              );
              lastUpdateTime = now;
            }
          } catch (error: any) {
            // Ignore "message is not modified" errors
            if (!error.description?.includes("message is not modified")) {
              console.error("Error updating message:", error);
            }
          }
        }

        // Small delay to avoid busy loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    };

    // Run both the agent prompt and update loop
    await Promise.all([promptPromise, updateLoop()]);

    // Final update with complete text
    if (messageId && currentText) {
      console.log("📝 Performing final message update...");
      try {
        await ctx.api.editMessageText(
          ctx.chat?.id!,
          messageId,
          currentText.substring(0, 4096),
          { parse_mode: "Markdown" }
        );
      } catch (error: any) {
        console.warn(
          "Markdown parsing failed for final message, falling back to plain text."
        );
        try {
          await ctx.api.editMessageText(
            ctx.chat?.id!,
            messageId,
            currentText.substring(0, 4096)
          );
        } catch (e) {
          // Ignore
        }
      }
    }
  } catch (error) {
    console.error("Error in streamToTelegram:", error);

    // Send error message
    if (messageId) {
      try {
        await ctx.api.editMessageText(
          ctx.chat?.id!,
          messageId,
          "❌ 抱歉，处理您的请求时遇到错误。请重试。"
        );
      } catch (e) {}
    } else {
      await ctx.reply(
        "❌ 抱歉，处理您的请求时遇到错误。请重试。"
      );
    }
  } finally {
    unsubscribe();
  }
}
