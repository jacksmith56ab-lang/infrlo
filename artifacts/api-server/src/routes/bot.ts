import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  CreateBotOrderBody,
  CreateBotOrderResponse,
  GetBotHeartbeatResponse,
  GetBotSettingsResponse,
  ReportBotHeartbeatBody,
  ReportBotHeartbeatResponse,
  UpdateBotSettingsBody,
  UpsertBotUserBody,
  UpsertBotUserResponse,
} from "@workspace/api-zod";
import { asBotSettings, asDate, asOrder, asUser } from "./admin-utils";

const router: IRouter = Router();
const defaultSettings = {
  botName: "My Telegram Bot",
  welcomeMessage: "Welcome! Use /catalog to browse products.",
  supportUsername: "",
  currency: "KZT",
  adminName: "Administrator",
  adminContact: "",
  botEnabled: true,
};

async function ensureSettings() {
  await pool.query(
    `INSERT INTO bot_admin_settings (id, bot_name, welcome_message, support_username,
       currency, admin_name, admin_contact, bot_enabled)
     VALUES (1, $1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [
      defaultSettings.botName,
      defaultSettings.welcomeMessage,
      defaultSettings.supportUsername,
      defaultSettings.currency,
      defaultSettings.adminName,
      defaultSettings.adminContact,
      defaultSettings.botEnabled,
    ],
  );
}

router.get("/bot/settings", async (_req, res): Promise<void> => {
  await ensureSettings();
  const result = await pool.query(
    "SELECT * FROM bot_admin_settings WHERE id = 1",
  );
  res.json(GetBotSettingsResponse.parse(asBotSettings(result.rows[0])));
});

router.patch("/bot/settings", async (req, res): Promise<void> => {
  const parsed = UpdateBotSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureSettings();
  const columns: Record<string, unknown> = {
    botName: parsed.data.botName,
    welcomeMessage: parsed.data.welcomeMessage,
    supportUsername: parsed.data.supportUsername,
    currency: parsed.data.currency?.toUpperCase(),
    adminName: parsed.data.adminName,
    adminContact: parsed.data.adminContact,
    botEnabled: parsed.data.botEnabled,
  };
  const columnNames: Record<string, string> = {
    botName: "bot_name",
    welcomeMessage: "welcome_message",
    supportUsername: "support_username",
    currency: "currency",
    adminName: "admin_name",
    adminContact: "admin_contact",
    botEnabled: "bot_enabled",
  };
  const setters: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(columns)) {
    if (value === undefined) continue;
    values.push(value);
    setters.push(`${columnNames[key]} = $${values.length}`);
  }
  if (!setters.length) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  const result = await pool.query(
    `UPDATE bot_admin_settings SET ${setters.join(", ")}, updated_at = NOW()
     WHERE id = 1 RETURNING *`,
    values,
  );
  res.json(
    GetBotSettingsResponse.parse(asBotSettings(result.rows[0])),
  );
});

router.put("/bot/users", async (req, res): Promise<void> => {
  const parsed = UpsertBotUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await pool.query(
    `INSERT INTO bot_admin_users (telegram_id, name, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (telegram_id)
     DO UPDATE SET name = EXCLUDED.name, username = EXCLUDED.username,
       updated_at = NOW()
     RETURNING *`,
    [
      parsed.data.telegramId,
      parsed.data.name.trim(),
      parsed.data.username ?? null,
    ],
  );
  res.json(UpsertBotUserResponse.parse(asUser(result.rows[0])));
});

router.post("/bot/orders", async (req, res): Promise<void> => {
  const parsed = CreateBotOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const quantities = new Map<number, number>();
  for (const line of parsed.data.lines) {
    quantities.set(
      line.productId,
      (quantities.get(line.productId) ?? 0) + line.quantity,
    );
  }
  if ([...quantities.values()].some((quantity) => quantity > 99)) {
    res.status(400).json({ error: "A product quantity cannot exceed 99." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userResult = await client.query(
      "SELECT * FROM bot_admin_users WHERE telegram_id = $1 FOR UPDATE",
      [parsed.data.telegramId],
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Telegram user is not registered. Send /start first." });
      return;
    }
    if (user.status !== "active") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "This user is blocked." });
      return;
    }
    const settingResult = await client.query(
      "SELECT currency FROM bot_admin_settings WHERE id = 1",
    );
    const currency = String(settingResult.rows[0]?.currency ?? "KZT");
    const items: Array<{
      id: number;
      title: string;
      quantity: number;
      price: number;
    }> = [];
    for (const [productId, quantity] of quantities) {
      const productResult = await client.query(
        `SELECT * FROM bot_admin_products
         WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [productId],
      );
      const product = productResult.rows[0];
      if (!product) {
        await client.query("ROLLBACK");
        res.status(404).json({ error: `Product ${productId} is unavailable.` });
        return;
      }
      if (Number(product.stock) < quantity) {
        await client.query("ROLLBACK");
        res.status(400).json({ error: `Not enough stock for ${product.title}.` });
        return;
      }
      if (product.currency !== currency) {
        await client.query("ROLLBACK");
        res.status(400).json({
          error: `Set the bot currency to ${product.currency} before ordering this product.`,
        });
        return;
      }
      items.push({
        id: Number(product.id),
        title: product.title,
        quantity,
        price: Number(product.price),
      });
      await client.query(
        "UPDATE bot_admin_products SET stock = stock - $1, updated_at = NOW() WHERE id = $2",
        [quantity, product.id],
      );
    }
    const total =
      Math.round(
        items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100,
      ) / 100;
    const orderResult = await client.query(
      `INSERT INTO bot_admin_orders (telegram_id, customer_name, total, currency)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [parsed.data.telegramId, user.name, total, currency],
    );
    const order = orderResult.rows[0];
    for (const item of items) {
      await client.query(
        `INSERT INTO bot_admin_order_items (order_id, product_id, title, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.id, item.title, item.quantity, item.price],
      );
    }
    await client.query("COMMIT");
    const linesResult = await pool.query(
      "SELECT * FROM bot_admin_order_items WHERE order_id = $1 ORDER BY id",
      [order.id],
    );
    res
      .status(201)
      .json(
        CreateBotOrderResponse.parse(asOrder(order, linesResult.rows)),
      );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.post("/bot/heartbeat", async (req, res): Promise<void> => {
  const parsed = ReportBotHeartbeatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const result = await pool.query(
    `INSERT INTO bot_admin_runtime (id, adapter, last_seen_at)
     VALUES (1, $1, NOW())
     ON CONFLICT (id) DO UPDATE
       SET adapter = EXCLUDED.adapter, last_seen_at = NOW()
     RETURNING adapter, last_seen_at`,
    [parsed.data.adapter],
  );
  res.json(
    ReportBotHeartbeatResponse.parse({
      online: true,
      adapter: result.rows[0].adapter,
      lastSeenAt: asDate(result.rows[0].last_seen_at),
    }),
  );
});

router.get("/bot/heartbeat", async (_req, res): Promise<void> => {
  const result = await pool.query(
    "SELECT adapter, last_seen_at FROM bot_admin_runtime WHERE id = 1",
  );
  const lastSeenAt = result.rows[0]?.last_seen_at ?? null;
  const isRecent =
    lastSeenAt != null && Date.now() - new Date(lastSeenAt).getTime() < 90_000;
  res.json(
    GetBotHeartbeatResponse.parse({
      online: isRecent,
      adapter: result.rows[0]?.adapter ?? null,
      lastSeenAt: lastSeenAt == null ? null : asDate(lastSeenAt),
    }),
  );
});

export default router;
