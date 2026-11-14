import test from "node:test";
import assert from "node:assert/strict";
import { parentWalletMoney, summarizeWalletTransactions } from "../src/lib/wallet_ledger";

test("parent wallet money excludes coding coins and stays finite", () => {
  const transactions = [
    { type: "earn", amount: 8, source: "coding" },
    { type: "earn", amount: 3, source: "coding" },
    { type: "earn", amount: 2, source: "coding" },
    { type: "earn", amount: 250, source: "academic" },
    { type: "spend", amount: -100, source: "store" },
    { type: "earn", amount: Number.NaN, source: "academic" },
  ];
  const money = parentWalletMoney(transactions, 13 + 250 - 100);
  assert.equal(money.earned, 250);
  assert.equal(money.spent, 100);
  assert.equal(money.balance, 150);
  assert.equal(Number.isFinite(money.balance), true);
  assert.equal(Number.isFinite(money.earned), true);
  assert.equal(Number.isFinite(money.spent), true);

  const codingOnly = parentWalletMoney(transactions.slice(0, 3), 13);
  assert.equal(codingOnly.balance, 0);
  assert.equal(codingOnly.earned, 0);
  assert.equal(codingOnly.spent, 0);

  const ledger = summarizeWalletTransactions([], 13);
  assert.equal(ledger.totalEarned, 0);
  assert.equal(ledger.balance, 13);
});
