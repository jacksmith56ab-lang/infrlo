import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import {
  CreateProductBody,
  CreateProductResponse,
  DeleteProductParams,
  GetOrderParams,
  GetOrderResponse,
  GetOrdersQueryParams,
  GetOrdersResponse,
  GetProductsQueryParams,
  GetProductsResponse,
  UpdateOrderBody,
  UpdateOrderParams,
  UpdateOrderResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { asOrder, asProduct } from "./admin-utils";

const router: IRouter = Router();

router.get("/products", async (req, res): Promise<void> => {
  const parsed = GetProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const where: string[] = [];
  const values: unknown[] = [];
  if (parsed.data.q?.trim()) {
    values.push(`%${parsed.data.q.trim()}%`);
    where.push(
      `(title ILIKE $${values.length} OR category ILIKE $${values.length} OR description ILIKE $${values.length})`,
    );
  }
  if (parsed.data.status) {
    values.push(parsed.data.status);
    where.push(`status = $${values.length}`);
  }
  const result = await pool.query(
    `SELECT * FROM bot_admin_products ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC LIMIT 500`,
    values,
  );
  res.json(GetProductsResponse.parse(result.rows.map(asProduct)));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const item = parsed.data;
  const result = await pool.query(
    `INSERT INTO bot_admin_products
      (title, description, category, price, currency, image_url, stock, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      item.title.trim(),
      item.description,
      item.category.trim(),
      item.price,
      item.currency.toUpperCase(),
      item.imageUrl ?? null,
      item.stock,
      item.status,
    ],
  );
  res.status(201).json(CreateProductResponse.parse(asProduct(result.rows[0])));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const parsed = UpdateProductBody.safeParse(req.body);
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
  const item = parsed.data;
  const allowed = {
    title: item.title === undefined ? undefined : item.title.trim(),
    description: item.description,
    category: item.category === undefined ? undefined : item.category.trim(),
    price: item.price,
    currency: item.currency?.toUpperCase(),
    image_url: item.imageUrl,
    stock: item.stock,
    status: item.status,
  } satisfies Record<string, unknown>;
  const setters: string[] = [];
  const values: unknown[] = [];
  for (const [column, value] of Object.entries(allowed)) {
    if (value === undefined) continue;
    values.push(value);
    setters.push(`${column} = $${values.length}`);
  }
  if (!setters.length) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }
  values.push(params.data.id);
  const result = await pool.query(
    `UPDATE bot_admin_products SET ${setters.join(", ")}, updated_at = NOW()
     WHERE id = $${values.length} RETURNING *`,
    values,
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.json(UpdateProductResponse.parse(asProduct(result.rows[0])));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const references = await pool.query(
    "SELECT id FROM bot_admin_order_items WHERE product_id = $1 LIMIT 1",
    [params.data.id],
  );
  if (references.rows[0]) {
    res.status(400).json({
      error: "This product is in an order. Hide it instead of deleting it.",
    });
    return;
  }
  const result = await pool.query(
    "DELETE FROM bot_admin_products WHERE id = $1 RETURNING id",
    [params.data.id],
  );
  if (!result.rows[0]) {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.sendStatus(204);
});

async function loadOrders(where: string, values: unknown[]) {
  const result = await pool.query(
    `SELECT * FROM bot_admin_orders ${where} ORDER BY created_at DESC LIMIT 500`,
    values,
  );
  if (!result.rows.length) return [];
  const ids = result.rows.map((row) => Number(row.id));
  const lineResult = await pool.query(
    `SELECT * FROM bot_admin_order_items WHERE order_id = ANY($1::int[])
     ORDER BY id ASC`,
    [ids],
  );
  const linesByOrder = new Map<number, any[]>();
  for (const line of lineResult.rows) {
    const current = linesByOrder.get(Number(line.order_id)) ?? [];
    current.push(line);
    linesByOrder.set(Number(line.order_id), current);
  }
  return result.rows.map((row) =>
    asOrder(row, linesByOrder.get(Number(row.id)) ?? []),
  );
}

router.get("/orders", async (req, res): Promise<void> => {
  const parsed = GetOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const status = parsed.data.status;
  const where = status ? "WHERE status = $1" : "";
  const values = status ? [status] : [];
  res.json(GetOrdersResponse.parse(await loadOrders(where, values)));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const orders = await loadOrders("WHERE id = $1", [params.data.id]);
  if (!orders[0]) {
    res.status(404).json({ error: "Order not found." });
    return;
  }
  res.json(GetOrderResponse.parse(orders[0]));
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  const parsed = UpdateOrderBody.safeParse(req.body);
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
  const changes = parsed.data;
  if (changes.status === undefined && changes.customerName === undefined) {
    res.status(400).json({ error: "Provide at least one field to update." });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      "SELECT * FROM bot_admin_orders WHERE id = $1 FOR UPDATE",
      [params.data.id],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      res.status(404).json({ error: "Order not found." });
      return;
    }
    const nextStatus = changes.status ?? current.status;
    if (current.status !== nextStatus) {
      const items = await client.query(
        "SELECT product_id, quantity FROM bot_admin_order_items WHERE order_id = $1",
        [params.data.id],
      );
      for (const item of items.rows) {
        if (item.product_id == null) continue;
        if (nextStatus === "cancelled" && current.status !== "cancelled") {
          await client.query(
            "UPDATE bot_admin_products SET stock = stock + $1 WHERE id = $2",
            [item.quantity, item.product_id],
          );
        } else if (current.status === "cancelled" && nextStatus !== "cancelled") {
          const stock = await client.query(
            `UPDATE bot_admin_products SET stock = stock - $1
             WHERE id = $2 AND stock >= $1 RETURNING id`,
            [item.quantity, item.product_id],
          );
          if (!stock.rows[0]) {
            await client.query("ROLLBACK");
            res.status(400).json({
              error: "There is not enough stock to reopen this order.",
            });
            return;
          }
        }
      }
    }
    const result = await client.query(
      `UPDATE bot_admin_orders
       SET status = $1, customer_name = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [
        nextStatus,
        changes.customerName?.trim() ?? current.customer_name,
        params.data.id,
      ],
    );
    await client.query("COMMIT");
    const lines = await pool.query(
      "SELECT * FROM bot_admin_order_items WHERE order_id = $1 ORDER BY id",
      [params.data.id],
    );
    const output = asOrder(result.rows[0], lines.rows);
    res.json(UpdateOrderResponse.parse(output));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

export default router;
