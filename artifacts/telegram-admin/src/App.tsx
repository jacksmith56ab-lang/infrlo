import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Link, useLocation, Router as WouterRouter } from 'wouter';
import {
  Activity, Banknote, Bot, Boxes, Check, ChevronRight,
  CircleAlert, Clock3, Edit3, Filter, LayoutDashboard,
  Package, Plus, Search, Settings2, ShoppingBag, Trash2, UserRound, Users, Wallet, X,
} from 'lucide-react';
import {
  getGetActivityQueryKey, getGetBotHeartbeatQueryKey, getGetBotSettingsQueryKey, getGetDashboardQueryKey,
  getGetOrderQueryKey, getGetOrdersQueryKey, getGetProductsQueryKey, getGetUserTransactionsQueryKey,
  getGetUsersQueryKey, getHealthCheckQueryKey, useChangeUserBalance, useCreateProduct,
  useCreateUser, useDeleteProduct, useDeleteUser, useGetActivity, useGetBotHeartbeat,
  useGetBotSettings, useGetDashboard, useGetOrder, useGetOrders, useGetProducts,
  useGetUserTransactions, useGetUsers, useHealthCheck, useUpdateBotSettings,
  useUpdateOrder, useUpdateProduct, useUpdateUser,
} from '@workspace/api-client-react';
import type { ActivityItem, Order, OrderStatus, Product, User } from '@workspace/api-client-react';

const queryClient = new QueryClient();
const currency = (amount: number, code = 'USD') => new Intl.NumberFormat('en', { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(amount);
const date = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not reported';
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const statusClass = (status: string) => `status-pill status-${status}`;
const orderStatuses: OrderStatus[] = ['new', 'processing', 'shipped', 'completed', 'cancelled'];

function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const links = [
    { href: '/', label: 'Overview', icon: LayoutDashboard },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/products', label: 'Products', icon: Package },
    { href: '/orders', label: 'Orders', icon: ShoppingBag },
    { href: '/settings', label: 'Settings', icon: Settings2 },
  ];
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><Bot size={19} /></span><span>BotDesk</span></Link>
      <p className="nav-label">Workspace</p>
      <nav className="nav-links">{links.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={`nav-link ${location === href ? 'active' : ''}`} data-testid={`link-${label.toLowerCase()}`}><Icon size={16} strokeWidth={1.8} />{label}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="no-auth"><strong>Open operations panel</strong><p>This dashboard intentionally has no authentication. Keep it on a trusted network.</p></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><span className="crumb">BotDesk <ChevronRight size={12} style={{ verticalAlign: 'middle', margin: '0 5px' }} /> Operations</span><span className="top-status"><i className="live-dot" /> Control panel ready</span></header>{children}</main>
  </div>;
}

function PageHead({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-head"><div><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="page-subtitle">{subtitle}</p></div>{action}</div>;
}
function Panel({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) { return <section className={`panel ${className}`} style={style}>{children}</section>; }
function LoadingRows() { return <div className="loading-state"><div style={{ display: 'grid', gap: 13, maxWidth: 450, margin: 'auto' }}>{[1, 2, 3].map((n) => <div key={n} className="skeleton" style={{ width: `${100 - n * 10}%` }} />)}</div></div>; }
function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="error-state"><CircleAlert size={25} style={{ marginBottom: 9, color: '#ed9995' }} /><p>Could not load this data.</p><button className="btn" onClick={onRetry}>Try again</button></div>; }
function EmptyState({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) { return <div className="empty-state"><div className="empty-mark"><Boxes size={20} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>; }
function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={17} /></button></div>{children}</section></div>;
}
function Field({ label, children, full = false }: { label: string; children: ReactNode; full?: boolean }) { return <div className={`field ${full ? 'full' : ''}`}><label>{label}</label>{children}</div>; }
function moneyInput(value: string) { const amount = Number(value); return Number.isFinite(amount) ? amount : 0; }

function Overview() {
  const dashboard = useGetDashboard();
  const activity = useGetActivity();
  const health = useHealthCheck();
  const heartbeat = useGetBotHeartbeat();
  const data = dashboard.data ?? {
    users: 0,
    activeUsers: 0,
    products: 0,
    activeProducts: 0,
    orders: 0,
    pendingOrders: 0,
    revenue: 0,
    currency: 'KZT',
    orderCounts: [],
  };
  const counts = data.orderCounts;
  const orderTotal = Math.max(1, ...counts.map((item) => item.count));
  return <div className="page-wrap">
    <PageHead eyebrow="Control room / 01" title="Overview" subtitle="A live read on your bot, audience, and commerce." action={<button className="btn" onClick={() => { void dashboard.refetch(); void activity.refetch(); void health.refetch(); void heartbeat.refetch(); }}><Activity size={14} /> Refresh overview</button>} />
    {dashboard.isLoading ? <div className="stat-grid">{[1, 2, 3, 4].map((n) => <Panel key={n} className="stat-card"><div className="skeleton" /><div className="skeleton" style={{ marginTop: 20, width: '60%', height: 29 }} /></Panel>)}</div> : dashboard.isError ? <Panel><ErrorState onRetry={() => void dashboard.refetch()} /></Panel> : <>
      <div className="stat-grid">
        <Stat label="Audience" value={data.users.toLocaleString()} note={`${data.activeUsers.toLocaleString()} active profiles`} icon={<Users size={16} />} />
        <Stat label="Live catalog" value={data.activeProducts.toLocaleString()} note={`${data.products.toLocaleString()} products total`} icon={<Package size={16} />} />
        <Stat label="Orders placed" value={data.orders.toLocaleString()} note={`${data.pendingOrders.toLocaleString()} awaiting action`} icon={<ShoppingBag size={16} />} />
        <Stat label="Revenue" value={currency(data.revenue, data.currency)} note={`Recorded in ${data.currency}`} icon={<Banknote size={16} />} />
      </div>
      <div className="dashboard-grid">
        <Panel className="panel-pad"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><p className="section-kicker">Orders / distribution</p><h2 className="section-title" style={{ marginTop: 6 }}>Status pulse</h2></div><span className="muted mono">{data.orders} total</span></div>
          <div className="order-bars">{orderStatuses.map((status) => { const count = counts.find((item) => item.status === status)?.count ?? 0; return <div className="bar-row" key={status}><span style={{ textTransform: 'capitalize' }}>{status}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(count ? 4 : 0, count / orderTotal * 100)}%` }} /></div><span className="mono">{count}</span></div>; })}</div>
        </Panel>
        <div style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
          <Panel className="health-card"><div><span className="section-kicker">API gateway</span><div className="health-name">Health endpoint</div></div><span className={`status-pill ${health.isError ? 'status-offline' : 'status-online'}`}><i className={health.isError ? '' : 'live-dot'} />{health.isLoading ? 'Checking' : health.isError ? 'Unavailable' : 'Healthy'}</span></Panel>
          <Panel className="health-card"><div><span className="section-kicker">Telegram runtime</span><div className="health-name">{heartbeat.data?.adapter || 'Bot adapter'} · seen {date(heartbeat.data?.lastSeenAt)}</div></div><span className={`status-pill ${heartbeat.data?.online ? 'status-online' : 'status-offline'}`}><i className={heartbeat.data?.online ? 'live-dot' : ''} />{heartbeat.isLoading ? 'Checking' : heartbeat.data?.online ? 'Online' : 'Offline'}</span></Panel>
          <Panel className="panel-pad"><span className="section-kicker">Operations note</span><p style={{ fontSize: 12, lineHeight: 1.6, color: '#aaa0b3', margin: '10px 0 0' }}>Health and bot heartbeat are separate signals. A healthy API does not guarantee the Telegram adapter is connected.</p></Panel>
        </div>
      </div>
      <Panel className="panel-pad" style={{ marginTop: 15 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><p className="section-kicker">Latest changes</p><h2 className="section-title" style={{ marginTop: 6 }}>Recent activity</h2></div><span className="muted" style={{ fontSize: 11 }}>Latest records from the API</span></div>
        {activity.isLoading ? <LoadingRows /> : activity.isError ? <ErrorState onRetry={() => void activity.refetch()} /> : activity.data?.length ? <ActivityList items={activity.data.slice(0, 8)} /> : <EmptyState title="Nothing has happened yet" detail="User, product, and order activity will appear here." />}
      </Panel>
    </>}
  </div>;
}
function Stat({ label, value, note, icon }: { label: string; value: string; note: string; icon: ReactNode }) { return <Panel className="stat-card" style={{ '--wash': '#a783e4' } as CSSProperties}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="stat-label">{label}</span><span style={{ color: '#ba9be7' }}>{icon}</span></div><div className="stat-value">{value}</div><div className="stat-foot">{note}</div></Panel>; }
function ActivityList({ items }: { items: ActivityItem[] }) {
  const icon = (type: string) => type === 'user' ? <UserRound size={14} /> : type === 'product' ? <Package size={14} /> : <ShoppingBag size={14} />;
  return <div className="activity-list">{items.map((item) => <div className="activity-item" key={item.id} data-testid={`activity-item-${item.id}`}><span className="activity-mark">{icon(item.type)}</span><div><div className="activity-title">{item.title}</div><div className="activity-detail">{item.detail}</div></div><time className="activity-time">{date(item.createdAt)}</time></div>)}</div>;
}

function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalUser, setModalUser] = useState<User | null | undefined>(undefined);
  const [balanceUser, setBalanceUser] = useState<User | null>(null);
  const [historyUser, setHistoryUser] = useState<User | null>(null);
  const params = useMemo(() => search.trim() ? { q: search.trim() } : {}, [search]);
  const users = useGetUsers(params);
  const create = useCreateUser(); const update = useUpdateUser(); const remove = useDeleteUser(); const balance = useChangeUserBalance();
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: getGetUsersQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() })]); };
  return <div className="page-wrap"><PageHead eyebrow="Audience / 02" title="Users" subtitle="Profiles, access, and stored wallet balances." action={<button className="btn btn-primary" onClick={() => setModalUser(null)}><Plus size={15} /> Add user</button>} />
    <div className="toolbar"><label className="searchbox"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, username, Telegram ID" data-testid="input-search-users" /></label><span className="muted" style={{ fontSize: 11 }}>{users.data?.length ?? '—'} shown</span></div>
    <Panel><div className="table-wrap">{users.isLoading ? <LoadingRows /> : users.isError ? <ErrorState onRetry={() => void users.refetch()} /> : users.data?.length ? <table className="data-table"><thead><tr><th>User</th><th>Telegram ID</th><th>Wallet</th><th>Status</th><th>Joined</th><th /></tr></thead><tbody>{users.data.map((user) => <tr key={user.id} data-testid={`row-user-${user.id}`}><td><div className="person"><div className="avatar">{initials(user.name)}</div><div><div className="person-name">{user.name}</div><div className="person-meta">{user.username ? `@${user.username}` : 'No username'}</div></div></div></td><td className="mono">{user.telegramId || '—'}</td><td className="mono">{currency(user.balance)}</td><td><span className={statusClass(user.status)}>{user.status}</span></td><td className="muted">{date(user.createdAt)}</td><td><div className="table-actions"><button className="icon-btn" title="Balance history" onClick={() => setHistoryUser(user)}><Clock3 size={15} /></button><button className="icon-btn" title="Change balance" onClick={() => setBalanceUser(user)}><Wallet size={15} /></button><button className="icon-btn" title="Edit user" onClick={() => setModalUser(user)}><Edit3 size={15} /></button><button className="icon-btn" title={user.status === 'blocked' ? 'Unblock user' : 'Block user'} onClick={() => update.mutate({ id: user.id, data: { status: user.status === 'blocked' ? 'active' : 'blocked' } }, { onSuccess: refresh })}><Filter size={15} /></button><button className="icon-btn" title="Delete user" onClick={() => { if (window.confirm(`Delete ${user.name}? This cannot be undone.`)) remove.mutate({ id: user.id }, { onSuccess: refresh }); }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table> : <EmptyState title="No users found" detail={search ? 'Try a different search, or create a new profile.' : 'Your bot audience will appear here.'} action={!search && <button className="btn btn-primary" onClick={() => setModalUser(null)}><Plus size={14} /> Add first user</button>} />}</div></Panel>
    {modalUser !== undefined && <UserModal user={modalUser} busy={create.isPending || update.isPending} onClose={() => setModalUser(undefined)} onSubmit={(data) => modalUser ? update.mutate({ id: modalUser.id, data }, { onSuccess: () => { void refresh(); setModalUser(undefined); } }) : create.mutate({ data }, { onSuccess: () => { void refresh(); setModalUser(undefined); } })} />}
    {balanceUser && <BalanceModal user={balanceUser} busy={balance.isPending} onClose={() => setBalanceUser(null)} onSubmit={(data) => balance.mutate({ id: balanceUser.id, data }, { onSuccess: () => { void refresh(); void qc.invalidateQueries({ queryKey: getGetUserTransactionsQueryKey(balanceUser.id) }); setBalanceUser(null); } })} />}
    {historyUser && <TransactionModal user={historyUser} onClose={() => setHistoryUser(null)} />}
  </div>;
}
function UserModal({ user, busy, onClose, onSubmit }: { user: User | null; busy: boolean; onClose: () => void; onSubmit: (data: any) => void }) {
  return <Modal title={user ? 'Edit user' : 'Add user'} subtitle="Keep the bot audience record accurate." onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const data = { name: String(f.get('name')), username: String(f.get('username') || '') || null, ...(user ? {} : { telegramId: String(f.get('telegramId') || '') || null, balance: moneyInput(String(f.get('balance') || '0')) }) }; onSubmit(data); }}><div className="form-grid"><Field label="Name"><input name="name" required defaultValue={user?.name} /></Field><Field label="Username"><input name="username" placeholder="without @" defaultValue={user?.username || ''} /></Field>{!user && <><Field label="Telegram ID"><input name="telegramId" /></Field><Field label="Starting balance"><input name="balance" type="number" min="0" step="0.01" defaultValue="0" /></Field></>}</div><div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button disabled={busy} className="btn btn-primary" type="submit">{busy ? 'Saving…' : user ? 'Save changes' : 'Create user'}</button></div></form></Modal>;
}
function BalanceModal({ user, busy, onClose, onSubmit }: { user: User; busy: boolean; onClose: () => void; onSubmit: (data: { amount: number; note: string }) => void }) {
  return <Modal title="Adjust wallet" subtitle={`${user.name} · current balance ${currency(user.balance)}`} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit({ amount: moneyInput(String(f.get('amount'))), note: String(f.get('note')) }); }}><div className="form-grid"><Field label="Amount (use minus to deduct)"><input name="amount" type="number" step="0.01" required placeholder="0.00" /></Field><Field label="Reason"><input name="note" required maxLength={240} placeholder="Manual adjustment" /></Field></div><div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Applying…' : 'Apply adjustment'}</button></div></form></Modal>;
}
function TransactionModal({ user, onClose }: { user: User; onClose: () => void }) {
  const transactions = useGetUserTransactions(user.id, { query: { queryKey: getGetUserTransactionsQueryKey(user.id), enabled: !!user.id } });
  return <Modal title="Wallet history" subtitle={`${user.name} · ${currency(user.balance)} current`} onClose={onClose}>{transactions.isLoading ? <LoadingRows /> : transactions.isError ? <ErrorState onRetry={() => void transactions.refetch()} /> : transactions.data?.length ? <div className="detail-lines">{transactions.data.map((item) => <div className="detail-line" key={item.id}><div><div>{item.note}</div><small className="muted">{date(item.createdAt)}</small></div><strong className="mono" style={{ color: item.amount >= 0 ? '#83d8b9' : '#ef9f9e' }}>{item.amount > 0 ? '+' : ''}{currency(item.amount)}</strong></div>)}</div> : <EmptyState title="No wallet activity" detail="Balance adjustments will be listed here." />}</Modal>;
}

function ProductsPage() {
  const qc = useQueryClient(); const [search, setSearch] = useState(''); const [modal, setModal] = useState<Product | null | undefined>(undefined);
  const params = useMemo(() => search.trim() ? { q: search.trim() } : {}, [search]);
  const products = useGetProducts(params); const create = useCreateProduct(); const update = useUpdateProduct(); const remove = useDeleteProduct();
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: getGetProductsQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() })]); };
  return <div className="page-wrap"><PageHead eyebrow="Commerce / 03" title="Products" subtitle="Manage the items your bot can offer." action={<button className="btn btn-primary" onClick={() => setModal(null)}><Plus size={15} /> New product</button>} />
    <div className="toolbar"><label className="searchbox"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search product title or category" data-testid="input-search-products" /></label><span className="muted" style={{ fontSize: 11 }}>{products.data?.length ?? '—'} listed</span></div>
    <Panel><div className="table-wrap">{products.isLoading ? <LoadingRows /> : products.isError ? <ErrorState onRetry={() => void products.refetch()} /> : products.data?.length ? <table className="data-table" style={{ minWidth: 730 }}><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>{products.data.map((product) => <tr key={product.id} data-testid={`row-product-${product.id}`}><td><div className="person">{product.imageUrl ? <img className="image-preview" src={product.imageUrl} alt="" /> : <div className="avatar"><Package size={15} /></div>}<div><div className="person-name">{product.title}</div><div className="person-meta">{product.description || 'No description'}</div></div></div></td><td>{product.category}</td><td className="mono">{currency(product.price, product.currency)}</td><td className="mono">{product.stock}</td><td><span className={statusClass(product.status)}>{product.status}</span></td><td><div className="table-actions"><button className="icon-btn" title={product.status === 'active' ? 'Hide product' : 'Publish product'} onClick={() => update.mutate({ id: product.id, data: { status: product.status === 'active' ? 'hidden' : 'active' } }, { onSuccess: refresh })}><Filter size={15} /></button><button className="icon-btn" title="Edit product" onClick={() => setModal(product)}><Edit3 size={15} /></button><button className="icon-btn" title="Delete product" onClick={() => { if (window.confirm(`Delete ${product.title}?`)) remove.mutate({ id: product.id }, { onSuccess: refresh }); }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table> : <EmptyState title="Catalog is empty" detail="Add your first product to make it available to your bot." action={<button className="btn btn-primary" onClick={() => setModal(null)}><Plus size={14} /> Add product</button>} />}</div></Panel>
    {modal !== undefined && <ProductModal product={modal} busy={create.isPending || update.isPending} onClose={() => setModal(undefined)} onSubmit={(data) => modal ? update.mutate({ id: modal.id, data }, { onSuccess: () => { void refresh(); setModal(undefined); } }) : create.mutate({ data }, { onSuccess: () => { void refresh(); setModal(undefined); } })} />}
  </div>;
}
function ProductModal({ product, busy, onClose, onSubmit }: { product: Product | null; busy: boolean; onClose: () => void; onSubmit: (data: any) => void }) {
  return <Modal title={product ? 'Edit product' : 'Create product'} subtitle="Product photos are linked by URL." onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const data = { title: String(f.get('title')), description: String(f.get('description') || ''), category: String(f.get('category')), price: moneyInput(String(f.get('price'))), currency: String(f.get('currency')).toUpperCase(), imageUrl: String(f.get('imageUrl') || '') || null, stock: moneyInput(String(f.get('stock'))), status: String(f.get('status')) }; onSubmit(data); }}><div className="form-grid"><Field label="Title"><input name="title" required defaultValue={product?.title} /></Field><Field label="Category"><input name="category" required defaultValue={product?.category} /></Field><Field label="Price"><input type="number" min="0" step="0.01" name="price" required defaultValue={product?.price ?? 0} /></Field><Field label="Currency"><input name="currency" required minLength={3} maxLength={3} defaultValue={product?.currency || 'USD'} /></Field><Field label="Stock"><input type="number" min="0" step="1" name="stock" required defaultValue={product?.stock ?? 0} /></Field><Field label="Visibility"><select name="status" defaultValue={product?.status || 'active'}><option value="active">Active</option><option value="hidden">Hidden</option></select></Field><Field label="Photo URL" full><input type="url" name="imageUrl" placeholder="https://…" defaultValue={product?.imageUrl || ''} /></Field><Field label="Description" full><textarea name="description" defaultValue={product?.description || ''} /></Field></div><div className="form-actions"><button type="button" className="btn" onClick={onClose}>Cancel</button><button disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : product ? 'Save product' : 'Create product'}</button></div></form></Modal>;
}

function OrdersPage() {
  const qc = useQueryClient(); const [filter, setFilter] = useState('all'); const [selected, setSelected] = useState<Order | null>(null);
  const params = useMemo(() => filter === 'all' ? {} : { status: filter as OrderStatus }, [filter]);
  const orders = useGetOrders(params); const update = useUpdateOrder();
  return <div className="page-wrap"><PageHead eyebrow="Commerce / 04" title="Orders" subtitle="Inspect each order and move it through fulfillment." />
    <div className="toolbar"><label className="select" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Filter size={14} /><select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ border: 0, outline: 0, background: 'transparent', color: 'inherit' }}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></label><span className="muted" style={{ fontSize: 11 }}>{orders.data?.length ?? '—'} orders</span></div>
    <Panel><div className="table-wrap">{orders.isLoading ? <LoadingRows /> : orders.isError ? <ErrorState onRetry={() => void orders.refetch()} /> : orders.data?.length ? <table className="data-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Placed</th><th /></tr></thead><tbody>{orders.data.map((order) => <tr key={order.id} data-testid={`row-order-${order.id}`}><td className="mono">#{order.id}</td><td><div className="person-name">{order.customerName}</div><div className="person-meta">{order.telegramId || 'Telegram ID unavailable'}</div></td><td>{order.lines.reduce((sum, line) => sum + line.quantity, 0)} items</td><td className="mono">{currency(order.total, order.currency)}</td><td><span className={statusClass(order.status)}>{order.status}</span></td><td className="muted">{date(order.createdAt)}</td><td><button className="btn" style={{ padding: '7px 10px' }} onClick={() => setSelected(order)}>Inspect <ChevronRight size={13} /></button></td></tr>)}</tbody></table> : <EmptyState title="No orders in this view" detail="New orders from the bot will show up here." />}</div></Panel>
    {selected && <OrderModal order={selected} busy={update.isPending} onClose={() => setSelected(null)} onStatus={(status) => update.mutate({ id: selected.id, data: { status } }, { onSuccess: (fresh) => { setSelected(fresh); void Promise.all([qc.invalidateQueries({ queryKey: getGetOrdersQueryKey() }), qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() }), qc.invalidateQueries({ queryKey: getGetActivityQueryKey() })]); } })} />}
  </div>;
}
function OrderModal({ order, busy, onClose, onStatus }: { order: Order; busy: boolean; onClose: () => void; onStatus: (status: OrderStatus) => void }) {
  const detail = useGetOrder(order.id, { query: { queryKey: getGetOrderQueryKey(order.id), enabled: true } });
  const record = detail.data || order;
  return <Modal title={`Order #${record.id}`} subtitle={`${record.customerName} · placed ${date(record.createdAt)}`} onClose={onClose}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className={statusClass(record.status)}>{record.status}</span><span className="mono">{record.telegramId || 'No Telegram ID'}</span></div><div className="detail-lines">{record.lines.map((line) => <div className="detail-line" key={line.id}><span>{line.title} <span className="muted">× {line.quantity}</span></span><strong className="mono">{currency(line.unitPrice * line.quantity, record.currency)}</strong></div>)}<div className="detail-line"><strong>Total</strong><strong className="mono">{currency(record.total, record.currency)}</strong></div></div><Field label="Update fulfillment status"><select value={record.status} disabled={busy} onChange={(e) => onStatus(e.target.value as OrderStatus)}>{orderStatuses.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select></Field><div className="form-actions"><button className="btn" onClick={onClose}>Done</button></div></Modal>;
}
function SettingsPage() {
  const qc = useQueryClient(); const settings = useGetBotSettings(); const heartbeat = useGetBotHeartbeat();
  const update = useUpdateBotSettings();
  const save = (data: any) => update.mutate({ data }, { onSuccess: () => { void Promise.all([qc.invalidateQueries({ queryKey: getGetBotSettingsQueryKey() }), qc.invalidateQueries({ queryKey: getGetBotHeartbeatQueryKey() })]); } });
  if (settings.isLoading) return <div className="page-wrap"><PageHead eyebrow="Control / 05" title="Settings" subtitle="Configure the bot and the administrator contact." /><Panel><LoadingRows /></Panel></div>;
  if (settings.isError || !settings.data) return <div className="page-wrap"><PageHead eyebrow="Control / 05" title="Settings" subtitle="Configure the bot and the administrator contact." /><Panel><ErrorState onRetry={() => void settings.refetch()} /></Panel></div>;
  const value = settings.data;
  return <div className="page-wrap"><PageHead eyebrow="Control / 05" title="Settings" subtitle="Configure the bot and the administrator contact." />
    <div className="settings-grid">
      <Panel className="panel-pad"><p className="section-kicker">Bot identity</p><h2 className="section-title" style={{ margin: '7px 0 20px' }}>Public-facing details</h2><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ botName: String(f.get('botName')), welcomeMessage: String(f.get('welcomeMessage')), supportUsername: String(f.get('supportUsername')), currency: String(f.get('currency')).toUpperCase() }); }}><div className="form-grid"><Field label="Bot name" full><input name="botName" required defaultValue={value.botName} /></Field><Field label="Support username"><input name="supportUsername" defaultValue={value.supportUsername} placeholder="@support" /></Field><Field label="Currency"><input name="currency" required minLength={3} maxLength={3} defaultValue={value.currency} /></Field><Field label="Welcome message" full><textarea name="welcomeMessage" maxLength={2000} defaultValue={value.welcomeMessage} /></Field></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 17 }}><button className="btn btn-primary" disabled={update.isPending}><Check size={14} />{update.isPending ? 'Saving…' : 'Save bot details'}</button></div></form></Panel>
      <div style={{ display: 'grid', gap: 15, alignContent: 'start' }}>
        <Panel className="panel-pad"><p className="section-kicker">Runtime / heartbeat</p><h2 className="section-title" style={{ margin: '7px 0 16px' }}>Bot connection</h2><div className="health-card" style={{ padding: 14, border: '1px solid #453a50', borderRadius: 12, background: '#211b2b' }}><div><span className="section-kicker">{heartbeat.data?.adapter || 'Telegram adapter'}</span><div className="health-name">Last signal · {date(heartbeat.data?.lastSeenAt)}</div></div><span className={`status-pill ${heartbeat.data?.online ? 'status-online' : 'status-offline'}`}>{heartbeat.isLoading ? 'Checking' : heartbeat.data?.online ? 'Online' : 'Offline'}</span></div><p className="muted" style={{ fontSize: 11, lineHeight: 1.6, margin: '13px 0 0' }}>Heartbeat is reported by your bot runtime; it cannot be manually sent from this admin panel.</p></Panel>
        <Panel className="panel-pad"><p className="section-kicker">Administrator</p><h2 className="section-title" style={{ margin: '7px 0 18px' }}>Owner profile</h2><form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save({ adminName: String(f.get('adminName')), adminContact: String(f.get('adminContact')) }); }}><div className="form-grid"><Field label="Name" full><input name="adminName" defaultValue={value.adminName} /></Field><Field label="Contact" full><input name="adminContact" defaultValue={value.adminContact} /></Field></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 17 }}><button className="btn btn-primary" disabled={update.isPending}><Check size={14} />Save profile</button></div></form></Panel>
        <Panel className="panel-pad"><p className="section-kicker">Bot availability</p><h2 className="section-title" style={{ margin: '7px 0 14px' }}>Accept new activity</h2><div className="toggle-row"><div><div style={{ fontWeight: 600, fontSize: 12 }}>Bot enabled</div><div className="muted" style={{ fontSize: 10, marginTop: 4 }}>{value.botEnabled ? 'Bot is available to users' : 'Bot is paused'}</div></div><button className={`toggle ${value.botEnabled ? 'on' : ''}`} aria-label="Toggle bot enabled" aria-pressed={value.botEnabled} onClick={() => save({ botEnabled: !value.botEnabled })} /></div><p className="muted" style={{ fontSize: 10, margin: '12px 0 0' }}>Updated {date(value.updatedAt)}</p></Panel>
        <div className="notice">No authentication is configured by design. This panel is suitable for a trusted local or private deployment only.</div>
      </div>
    </div>
  </div>;
}

function Router() {
  return <ErrorBoundary><AppShell><Switch><Route path="/" component={Overview} /><Route path="/users" component={UsersPage} /><Route path="/products" component={ProductsPage} /><Route path="/orders" component={OrdersPage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></AppShell></ErrorBoundary>;
}
function Root() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default Root;
