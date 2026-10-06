import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  ChangeUserBalanceBody,
  ChangeUserBalanceParams,
  ChangeUserBalanceResponse,
  CreateUserBody,
  CreateUserResponse,
  DeleteUserParams,
  GetUserTransactionsParams,
  GetUserTransactionsResponse,
  GetUsersQueryParams,
  GetUsersResponse,
  UpdateUserBody,
  UpdateUserParams,
  UpdateUserResponse,
} from "@workspace/api-zod";
import { asDate, asUser } from "./admin-utils";

const router: IRouter = Router();

router.get("/users", async (req, res): Promise<void> => {
  const parsed = GetUsersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const where: string[] = [];
  const values: unknown[] = [];
  if (parsed.data.q?.trim()) {
    values.push(`%${parsed.data.q.trim()}%`);
    where.push(
      `(name ILIKE $${values.length} OR username ILIKE $${values.length} OR telegram_id ILIKE $${values.length})`,
    );
  }
  if (parsed.data.status) {
    values.push(parsed.data.status);
    where.push(`status = $${values.length}`);
  }
  const sql = `SELECT * FROM bot_admin_users ${
    where.length ? `WHERE ${where.join(" AND ")}` : ""
  } ORDER BY created_at DESC LIMIT 500`;
  const result = await pool.query(sql, values);
  res.json(GetUsersResponse.parse(result.rows.map(asUser)));
});

router.post("/users", async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const { telegramId, name, username, balance } = parsed.data;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const initialBalance = balance ?? 0;
      const result = await client.query(
      `INSERT INTO bot_admin_users (telegram_id, name, username, balance)
       VALUES ($1, $2, $3, $4) RETURNING *`,
        [telegramId ?? null, name.trim(), username ?? null, initialBalance],
      );
      if (initialBalance > 0) {
        await client.query(
          `INSERT INTO bot_admin_balance_transactions (user_id, amount, note)
           VALUES ($1, $2, $3)`,
          [result.rows[0].id, initialBalance, "Opening balance"],
        );
      }
      await client.query("COMMIT");
      res.status(201).json(CreateUserResponse.parse(asUser(result.rows[0])));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(400).json({ error: "A user with this Telegram ID already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/users/:id", async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }

  const fields = parsed.data;
  const setters: string[] = [];
  const values: unknown[] = [];
  if (fields.name !== undefined) {
    values.push(fields.name.trim());
    setters.push(`name = $${values.length}`);
  }
  if (fields.username !== undefined) {
    values.push(fields.username);
    setters.push(`username = $${values.length}`);
  }
  if (fields.status !== undefined) {
    values.push(fields.status);
    setters.push(`status = $${values.length}`);
  }
  if (!setters.length) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  values.push(params.data.id);
  const result = await pool.query(
    `UPDATE bot_admin_users SET ${setters.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.json(UpdateUserResponse.parse(asUser(result.rows[0])));
});

router.delete("/users/:id", async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = await pool.query(
    "DELETE FROM bot_admin_users WHERE id = $1 RETURNING id",
    [params.data.id],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  res.sendStatus(204);
});

router.post("/users/:id/balance", async (req, res): Promise<void> => {
  const params = ChangeUserBalanceParams.safeParse(req.params);
  const parsed = ChangeUserBalanceBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.message,
    });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE bot_admin_users
       SET balance = balance + $1, updated_at = NOW()
       WHERE id = $2 AND balance + $1 >= 0
       RETURNING *`,
      [parsed.data.amount, params.data.id],
    );
    if (!result.rows[0]) {
      const exists = await client.query(
        "SELECT id FROM bot_admin_users WHERE id = $1",
        [params.data.id],
      );
      await client.query("ROLLBACK");
      res.status(exists.rows[0] ? 400 : 404).json({
        error: exists.rows[0]
          ? "The balance cannot be less than zero."
          : "User not found.",
      });
      return;
    }
    await client.query(
      `INSERT INTO bot_admin_balance_transactions (user_id, amount, note)
       VALUES ($1, $2, $3)`,
      [params.data.id, parsed.data.amount, parsed.data.note.trim()],
    );
    await client.query("COMMIT");
    res.json(ChangeUserBalanceResponse.parse(asUser(result.rows[0])));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

router.get("/users/:id/transactions", async (req, res): Promise<void> => {
  const params = GetUserTransactionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const user = await pool.query("SELECT id FROM bot_admin_users WHERE id = $1", [
    params.data.id,
  ]);
  if (!user.rows[0]) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const result = await pool.query(
    `SELECT id, amount, note, created_at FROM bot_admin_balance_transactions
     WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
    [params.data.id],
  );
  res.json(
    GetUserTransactionsResponse.parse(
      result.rows.map((row) => ({
        id: Number(row.id),
        amount: Number(row.amount),
        note: row.note,
        createdAt: asDate(row.created_at),
      })),
    ),
  );
});

export default router;
