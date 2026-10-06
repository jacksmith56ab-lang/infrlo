import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { GetActivityResponse, GetDashboardResponse } from "@workspace/api-zod";
import { asDate } from "./admin-utils";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [users, products, orders, revenue, groupedOrders, settings] =
    await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active
         FROM bot_admin_users`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'active')::int AS active
         FROM bot_admin_products`,
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status IN ('new', 'processing'))::int AS pending
         FROM bot_admin_orders`,
      ),
      pool.query(
        `SELECT COALESCE(SUM(total) FILTER (WHERE status = 'completed'), 0) AS value
         FROM bot_admin_orders`,
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM bot_admin_orders GROUP BY status`,
      ),
      pool.query(
        "SELECT currency FROM bot_admin_settings WHERE id = 1",
      ),
    ]);
  const counts = new Map(
    groupedOrders.rows.map((row) => [row.status, Number(row.count)]),
  );
  const orderCounts = ["new", "processing", "shipped", "completed", "cancelled"].map(
    (status) => ({ status, count: counts.get(status) ?? 0 }),
  );
  res.json(
    GetDashboardResponse.parse({
      users: Number(users.rows[0].total),
      activeUsers: Number(users.rows[0].active),
      products: Number(products.rows[0].total),
      activeProducts: Number(products.rows[0].active),
      orders: Number(orders.rows[0].total),
      pendingOrders: Number(orders.rows[0].pending),
      revenue: Number(revenue.rows[0].value),
      currency: settings.rows[0]?.currency ?? "KZT",
      orderCounts,
    }),
  );
});

router.get("/activity", async (_req, res): Promise<void> => {
  const result = await pool.query(
    `SELECT id, 'user' AS type, name AS title,
            COALESCE('@' || username, 'New Telegram user') AS detail,
            created_at
       FROM bot_admin_users
     UNION ALL
     SELECT id, 'product' AS type, title,
            category AS detail, created_at
       FROM bot_admin_products
     UNION ALL
     SELECT id, 'order' AS type, 'Order #' || id AS title,
            status || ' · ' || customer_name AS detail, created_at
       FROM bot_admin_orders
     ORDER BY created_at DESC LIMIT 12`,
  );
  res.json(
    GetActivityResponse.parse(
      result.rows.map((row) => ({
        id: `${row.type}-${row.id}`,
        type: row.type,
        title: row.title,
        detail: row.detail,
        createdAt: asDate(row.created_at),
      })),
    ),
  );
});

export default router;
