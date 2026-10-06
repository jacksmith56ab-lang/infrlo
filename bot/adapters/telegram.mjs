export class TelegramAdapter {
  constructor(token) {
    this.baseUrl = `https://api.telegram.org/bot${token}`;
  }

  async call(method, payload = {}, timeoutMs = 12_000) {
    let response;
    try {
      response = await fetch(`${this.baseUrl}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new Error(`Telegram ${method} network request failed.`);
    }
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error(`Telegram ${method} returned invalid JSON.`);
    }
    if (!response.ok || !result.ok) {
      throw new Error(
        `Telegram ${method} failed: ${result.description ?? response.statusText}`,
      );
    }
    return result.result;
  }

  getMe() {
    return this.call("getMe");
  }

  getUpdates(offset) {
    return this.call("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] }, 40_000);
  }

  sendMessage(chatId, text, replyMarkup) {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      disable_web_page_preview: true,
    });
  }

  answerCallbackQuery(callbackQueryId, text) {
    return this.call("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      text,
    });
  }
}
