// Server-side Plaid income read (Sandbox). Used by /api/plaid-income.
//
// In PRODUCTION this exact read runs INSIDE the AWS Nitro enclave (Plaid keys from AWS
// Secrets Manager, fetched at runtime so they never land in the PCRs); here it is the
// testnet attester stand-in. The raw transactions never leave the server — only the
// computed monthly-average income is returned. NEVER import this from a client component:
// it reads PLAID_SECRET. Configure PLAID_CLIENT_ID + PLAID_SECRET in app/.env.local (gitignored).

const HOSTS: Record<string, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};
const BASE = HOSTS[process.env.PLAID_ENV ?? "sandbox"] ?? HOSTS.sandbox;

export type IncomeMonth = { month: string; amount: number }; // whole USD
export type PlaidIncome = { avgMonthlyUsdc: number; months: IncomeMonth[]; source: string };

type PlaidTxn = {
  transaction_id: string;
  amount: number; // Plaid convention: negative = money IN (a credit/deposit)
  date: string;
  name?: string;
  merchant_name?: string;
};
type SyncResp = { added: PlaidTxn[]; next_cursor: string; has_more: boolean };

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

async function pj<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      ...body,
    }),
  });
  const j = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`plaid ${path} ${res.status}: ${(j.error_code as string) ?? "error"}`);
  return j as T;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A Sandbox "custom user" whose checking account shows ~6 months of payroll + gig
// deposits, so the live read returns Maria-shaped income. (Sandbox custom transactions
// only generate for ~the last 90 days, so we average whatever recent months Plaid
// actually returns — a real read, not a hard-coded number.)
function customUser(): string {
  const PAYROLL = 2700;
  const GIG = [1500, 1520, 1480, 1510, 1490, 1505];
  const now = new Date();
  const transactions: Record<string, unknown>[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15));
    const date = d.toISOString().slice(0, 10);
    transactions.push({ date_transacted: date, date_posted: date, amount: -PAYROLL, description: "ACME CORP PAYROLL DIRECT DEP", currency: "USD" });
    transactions.push({ date_transacted: date, date_posted: date, amount: -GIG[i], description: "RIDESHARE GIG PAYOUT", currency: "USD" });
  }
  return JSON.stringify({
    override_accounts: [{ type: "depository", subtype: "checking", starting_balance: 5200, transactions }],
  });
}

const isIncome = (name: string) => /payroll|direct dep|gig|payout/i.test(name);

/** Link a sandbox account, sync transactions, and compute the average monthly income. */
export async function fetchSandboxMonthlyIncome(): Promise<PlaidIncome> {
  const ptc = await pj<{ public_token: string }>("/sandbox/public_token/create", {
    institution_id: "ins_109508",
    initial_products: ["transactions"],
    options: { override_username: "user_custom", override_password: customUser() },
  });
  const ex = await pj<{ access_token: string }>("/item/public_token/exchange", {
    public_token: ptc.public_token,
  });
  const at = ex.access_token;

  // Poll /transactions/sync until the async historical update lands. The custom-user
  // transactions arrive a few seconds AFTER the item is created, so we must NOT bail just
  // because the first polls are empty — only stop early once income has actually arrived
  // and no new transactions are coming in. Budget is generous (the historical update has
  // taken ~12s in practice); the modal hides this wait behind the login step.
  const INCOME_BUDGET_MS = 22_000;
  const seen = new Map<string, PlaidTxn>();
  let cursor: string | null = null;
  let stable = 0;
  const t0 = Date.now();
  const incomeCount = () => {
    let n = 0;
    for (const t of seen.values()) if (t.amount < 0 && isIncome(t.name ?? t.merchant_name ?? "")) n++;
    return n;
  };
  while (Date.now() - t0 < INCOME_BUDGET_MS) {
    let hasMore = true;
    let gotNew = false;
    while (hasMore) {
      let s: SyncResp;
      try {
        s = await pj<SyncResp>("/transactions/sync", cursor ? { access_token: at, cursor } : { access_token: at });
      } catch (e) {
        if (String(e).includes("PRODUCT_NOT_READY")) { hasMore = false; break; }
        throw e;
      }
      for (const t of s.added) {
        if (!seen.has(t.transaction_id)) { seen.set(t.transaction_id, t); gotNew = true; }
      }
      cursor = s.next_cursor;
      hasMore = s.has_more;
    }
    // Only allow an early stop once we actually have income and it has settled.
    if (incomeCount() > 0) {
      stable = gotNew ? 0 : stable + 1;
      if (stable >= 2) break;
    }
    if (Date.now() - t0 < INCOME_BUDGET_MS) await wait(1000);
  }

  // Group income credits (amount < 0) by YYYY-MM, sum each month, average the monthly totals.
  const byMonth = new Map<string, number>();
  for (const t of seen.values()) {
    if (t.amount < 0 && isIncome(t.name ?? t.merchant_name ?? "")) {
      const m = t.date.slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(t.amount));
    }
  }
  const months = [...byMonth.entries()].sort().map(([month, amount]) => ({ month, amount: Math.round(amount) }));
  if (months.length === 0) throw new Error("no income transactions returned from Plaid");
  const avgMonthlyUsdc = Math.round(months.reduce((a, m) => a + m.amount, 0) / months.length);
  return { avgMonthlyUsdc, months, source: "plaid-sandbox" };
}
