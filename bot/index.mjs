import { TelegramAdapter } from "./adapters/telegram.mjs";

const token = process.env.BOT_TOKEN?.trim();
const apiBaseUrl = process.env.API_BASE_URL?.trim().replace(/\/+$/, "");

if (!token) throw new Error("BOT_TOKEN is required.");
if (!apiBaseUrl) throw new Error("API_BASE_URL is required.");
if (!apiBaseUrl.endsWith("/api")) {
  throw new Error("API_BASE_URL must end with /api.");
}

const telegram = new TelegramAdapter(token);

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...options.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    throw new Error(body?.error ?? `API request failed with ${response.status}.`);
  }
  return body;
}

async function upsertUser(from) {
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || `Telegram ${from.id}`;
  return api("/bot/users", {
    method: "PUT",
    body: JSON.stringify({
      telegramId: String(from.id),
      name,
      username: from.username ?? null,
    }),
  });
}

async function getSettings() {
  return api("/bot/settings");
}

async function sendCatalog(chatId) {
  const products = await api("/products?status=active");
  const available = products.filter((product) => product.stock > 0);
  if (!available.length) {
    await telegram.sendMessage(chatId, "There are no products available right now.");
    return;
  }
  const keyboard = available.slice(0, 20).map((product) => [{
    text: `${product.title.slice(0, 48)} — ${product.price} ${product.currency}`,
    callback_data: `product:${product.id}`,
  }]);
  await telegram.sendMessage(
    chatId,
    "Choose a product to place an order:",
    { inline_keyboard: keyboard },
  );
}

async function createOrder(chatId, telegramId, productId, quantity = 1) {
  const order = await api("/bot/orders", {
    method: "POST",
    body: JSON.stringify({
      telegramId: String(telegramId),
      lines: [{ productId, quantity }],
    }),
  });
  await telegram.sendMessage(
    chatId,
    `Order #${order.id} created for ${order.total} ${order.currency}. We will contact you about the next steps.`,
  );
}

async function showBalance(chatId, telegramId) {
  const users = await api(`/users?q=${encodeURIComponent(String(telegramId))}`);
  const user = users.find((candidate) => candidate.telegramId === String(telegramId));
  if (!user) {
    await telegram.sendMessage(chatId, "Send /start first so I can create your account.");
    return;
  }
  const settings = await getSettings();
  await telegram.sendMessage(
    chatId,
    `Your balance: ${user.balance} ${settings.currency}.`,
  );
}

async function handleMessage(message) {
  const text = message.text?.trim() ?? "";
  if (!text.startsWith("/")) return;
  const from = message.from;
  if (!from) return;
  const user = await upsertUser(from);
  const settings = await getSettings();
  if (user.status !== "active") {
    await telegram.sendMessage(message.chat.id, "Your account is blocked. Contact support for help.");
    return;
  }
  if (!settings.botEnabled) {
    await telegram.sendMessage(message.chat.id, "This bot is temporarily paused.");
    return;
  }

  const [command, ...args] = text.split(/\s+/);
  switch (command.split("@")[0].toLowerCase()) {
    case "/start":
      await telegram.sendMessage(
        message.chat.id,
        `${settings.botName}\n\n${settings.welcomeMessage}\n\nAvailable commands: /catalog, /buy, /balance, /help`,
      );
      break;
    case "/catalog":
      await sendCatalog(message.chat.id);
      break;
    case "/buy": {
      const productId = Number(args[0]);
      const quantity = Number(args[1] ?? 1);
      if (!Number.isInteger(productId) || productId < 1 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        await telegram.sendMessage(message.chat.id, "Usage: /buy PRODUCT_ID [QUANTITY]");
        break;
      }
      await createOrder(message.chat.id, user.telegramId, productId, quantity);
      break;
    }
    case "/balance":
      await showBalance(message.chat.id, user.telegramId);
      break;
    case "/help":
      {
      const support = settings.supportUsername
        ? `\nSupport: ${settings.supportUsername.startsWith("@") ? settings.supportUsername : `@${settings.supportUsername}`}`
        : settings.adminContact
          ? `\nSupport contact: ${settings.adminContact}`
          : "";
      await telegram.sendMessage(
        message.chat.id,
        `Commands:\n/catalog — browse products\n/buy PRODUCT_ID [QUANTITY] — place an order\n/balance — check your account balance${support}`,
      );
      break;
      }
    default:
      await telegram.sendMessage(message.chat.id, "Use /help to see available commands.");
  }
}

async function handleCallback(callback) {
  if (!callback.message || !callback.from) return;
  const match = /^product:(\d+)$/.exec(callback.data ?? "");
  if (!match) {
    await telegram.answerCallbackQuery(callback.id, "Unknown action.");
    return;
  }
  try {
    await upsertUser(callback.from);
    const settings = await getSettings();
    if (!settings.botEnabled) {
      await telegram.answerCallbackQuery(callback.id, "This bot is paused.");
      return;
    }
    await telegram.answerCallbackQuery(callback.id, "Creating your order…");
    await createOrder(callback.message.chat.id, callback.from.id, Number(match[1]));
  } catch (error) {
    await telegram.answerCallbackQuery(callback.id, "Could not create the order.");
    await telegram.sendMessage(callback.message.chat.id, error.message);
  }
}

async function handleUpdate(update) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
  } else if (update.message) {
    try {
      await handleMessage(update.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Please try again later.";
      await telegram.sendMessage(update.message.chat.id, `Request failed: ${detail}`);
      console.error(`Could not process Telegram update ${update.update_id}:`, detail);
    }
  }
}

async function sendHeartbeat() {
  try {
    await api("/bot/heartbeat", {
      method: "POST",
      body: JSON.stringify({ adapter: "telegram" }),
    });
  } catch (error) {
    console.error("Bot heartbeat failed:", error.message);
  }
}

await telegram.getMe();
await sendHeartbeat();
setInterval(sendHeartbeat, 30_000);
console.info("Telegram bot is polling for updates.");

let offset = 0;
while (true) {
  try {
    const updates = await telegram.getUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        await handleUpdate(update);
      } catch (error) {
        console.error(`Could not process Telegram update ${update.update_id}:`, error.message);
      }
    }
  } catch (error) {
    console.error("Telegram polling failed; retrying shortly:", error.message);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
