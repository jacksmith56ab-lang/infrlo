export function asDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function asUser(row: any) {
  return {
    id: Number(row.id),
    telegramId: row.telegram_id ?? null,
    name: String(row.name),
    username: row.username ?? null,
    balance: Number(row.balance),
    status: row.status,
    createdAt: asDate(row.created_at),
  };
}

export function asProduct(row: any) {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description ?? ""),
    category: String(row.category),
    price: Number(row.price),
    currency: String(row.currency),
    imageUrl: row.image_url ?? null,
    stock: Number(row.stock),
    status: row.status,
    createdAt: asDate(row.created_at),
  };
}

export function asOrder(row: any, lines: any[] = []) {
  return {
    id: Number(row.id),
    telegramId: row.telegram_id ?? null,
    customerName: String(row.customer_name),
    status: row.status,
    total: Number(row.total),
    currency: String(row.currency),
    lines: lines.map((line) => ({
      id: Number(line.id),
      productId: line.product_id == null ? null : Number(line.product_id),
      title: String(line.title),
      quantity: Number(line.quantity),
      unitPrice: Number(line.unit_price),
    })),
    createdAt: asDate(row.created_at),
  };
}

export function asBotSettings(row: any) {
  return {
    botName: String(row.bot_name),
    welcomeMessage: String(row.welcome_message),
    supportUsername: String(row.support_username),
    currency: String(row.currency),
    adminName: String(row.admin_name),
    adminContact: String(row.admin_contact),
    botEnabled: Boolean(row.bot_enabled),
    updatedAt: asDate(row.updated_at),
  };
}
