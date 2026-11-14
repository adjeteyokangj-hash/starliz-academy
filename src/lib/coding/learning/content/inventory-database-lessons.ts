import { authorLesson, scenario, eq } from "../authoring";
import { inventoryArtifact, inventoryContexts } from "./inventory-service-tools";

function normalized(faulty = false) { return inventoryArtifact(`import sqlite3
from inventory_db import connect,seed,snapshot
def solve(data):
    database=connect()
    seed(database,data['quantity'])
    ${faulty ? "database.execute('ALTER TABLE stock ADD COLUMN item_title TEXT')\n    database.execute(\"UPDATE stock SET item_title='Fictional paper'\")" : "# Item title belongs only to items; stock references the stable key."}
    database.execute('UPDATE items SET title=? WHERE id=?',(data['new_title'],'paper'))
    rows=[list(row) for row in database.execute(${faulty ? '"SELECT s.item_id,s.location_id,s.item_title,s.quantity FROM stock s ORDER BY s.location_id"' : '"SELECT s.item_id,s.location_id,i.title,s.quantity FROM stock s JOIN items i ON i.id=s.item_id ORDER BY s.location_id"'})]
    schema=[row[1] for row in database.execute('PRAGMA table_info(stock)')]
    key=[row[1] for row in database.execute('PRAGMA table_info(stock)') if row[5]]
    try:
        database.execute("UPDATE stock SET quantity=-1 WHERE location_id='store'")
        negative_refused=False
    except sqlite3.IntegrityError: negative_refused=True
    broken=[list(row) for row in database.execute('PRAGMA foreign_key_check')]
    database.close()
    return {'rows':rows,'stock_columns':schema,'stock_key':key,'negative_refused':negative_refused,'broken_relationships':broken}
`); }
function normalizationCases(id: string, index: number) { return [inventoryContexts[index]!.initial, 0].map((quantity, variant) => { const new_title = `${inventoryContexts[index]!.title} revised item`; return scenario(`${id}-${variant}`, { quantity, new_title }, eq("result.rows", [["paper", "store", new_title, quantity], ["paper", "workshop", new_title, 0]], "The actual single authoritative item-title update reaches both related stock locations without duplicated stale facts"), eq("result.stock_columns", ["item_id", "location_id", "quantity", "revision"], "The real stock table stores only relationship keys, quantity and revision rather than duplicating item titles"), eq("result.stock_key", ["item_id", "location_id"], "The actual composite key identifies one item/location stock fact"), eq("result.negative_refused", true, "A real SQLite CHECK constraint refuses negative stored stock"), eq("result.broken_relationships", [], "The real stored relationships satisfy foreign-key integrity")); }); }
const normalization = authorLesson({ id: "Y10.07", workbench: "python", concepts: ["relational design", "normalisation", "composite key", "constraint", "single fact"],
  explanation: "Model a fictional inventory in a real isolated SQLite project database. Items own stable ID and title, locations own stable ID and title, and stock owns item/location keys, quantity and revision with a composite key. Quantity must be a non-negative stored integer and foreign keys enforce relationships. The seeded stock table duplicates item_title. Updating the authoritative item title then leaves both copied stock titles stale. Remove the duplicated fact and read current titles through the actual item relationship. Inspect the real table columns, composite key, joined rows, foreign-key audit and a deliberately refused negative update. Test positive and zero starting stock. Independent domains change the revised title and initial quantity. The actual inventory.db is captured as a private SQL project snapshot; no Supabase or application database is involved. Normalisation here prevents a demonstrated inconsistent fact, not every possible software defect.",
  reasoning: ["One authoritative fact referenced by stable keys avoids independent copies drifting after an update.", "A relational model needs actual key/constraint enforcement and inspectable joined behaviour, not only an entity diagram."], starter: normalized(true), reference: normalized(), faulty: normalized(true), cases: normalizationCases("normalised-inventory-facts", 0), transfer: [1, 2].map(index => ({ task: `Model ${inventoryContexts[index]!.title} with authoritative item titles, composite stock keys, non-negative quantity and real relationships. Rename the item once and verify both locations reflect it without a duplicated title column.`, starter: normalized(true), reference: normalized(), cases: normalizationCases(`new-normalised-inventory-${index}`, index) })), prediction: { prompt: "Item title is stored in items and copied into every stock row. A rename updates only items. What defect appears?", choices: ["No defect is possible", "Duplicated facts become inconsistent", "The composite key changes automatically"], correct: 1 },
});
function parameters(faulty = false) { return inventoryArtifact(`from inventory_db import connect,seed,snapshot
def solve(data):
    database=connect()
    seed(database,data['quantity'])
    before=snapshot(database)
    ${faulty ? `rows=[list(row) for row in database.execute("SELECT id,title FROM items WHERE title='"+data['query']+"' ORDER BY id")]
    changed=database.execute("UPDATE stock SET quantity=? WHERE item_id='"+data['item']+"' AND location_id='store'",(data['replacement'],)).rowcount` : `rows=[list(row) for row in database.execute('SELECT id,title FROM items WHERE title=? ORDER BY id',(data['query'],))]
    changed=database.execute('UPDATE stock SET quantity=? WHERE item_id=? AND location_id=?',(data['replacement'],data['item'],'store')).rowcount`}
    after=snapshot(database)
    database.close()
    return {'before':before,'matches':rows,'changed':changed,'after':after}
`); }
function parameterCases(id: string, index: number) { const quantity = inventoryContexts[index]!.initial; return [{ query: "Fictional paper", item: "paper", replacement: 0, matches: [["paper", "Fictional paper"]], changed: 1, after: 0 }, { query: "' OR 1=1 --", item: "paper' OR 1=1 --", replacement: 1, matches: [], changed: 0, after: quantity }].map((input, variant) => scenario(`${id}-${variant}`, { quantity, query: input.query, item: input.item, replacement: input.replacement }, eq("result.matches", input.matches, "The actual parameterised read treats quote-containing query text as a literal value rather than SQL source"), eq("result.changed", input.changed, "The actual parameterised update matches only the exact supplied stable ID"), eq("result.before", [{ item: "paper", location: "store", quantity, revision: 0 }, { item: "paper", location: "workshop", quantity: 0, revision: 0 }], "The real inventory state is captured before the operation"), eq("result.after", [{ item: "paper", location: "store", quantity: input.after, revision: 0 }, { item: "paper", location: "workshop", quantity: 0, revision: 0 }], "Literal inert injection-like input changes no stock while an authorised fixture update preserves valid zero and unrelated locations"))); }
const parameterized = authorLesson({ id: "Y10.08", workbench: "python", concepts: ["parameterised SQL", "read/write", "literal input", "stable key", "defensive test"],
  explanation: "Read and update actual synthetic SQLite stock using bound values. Use placeholders for a title query and for replacement quantity, item ID and location ID. The seeded implementation concatenates title and item text into SQL; an inert quote-containing fixture can change the query's meaning and broaden the update. Repair both boundaries, not only the read. Execute a normal exact-title read with a valid-zero update, then quote-containing values that must be treated literally and match nothing. Inspect actual before/after stock, returned rows and changed-row counts. No real database or external target is involved; all attack-like strings remain inside the isolated teaching fixture. Parameter binding separates data from SQL syntax but does not supply identity or authorisation, which later service lessons enforce separately. Independent inventories change starting quantities, so preserve their actual state when an exact key is absent.",
  reasoning: ["Escaping or checking only one query leaves an equivalent write boundary exposed; bind values at every database operation.", "A parameterised query can still be unauthorised, so distinguish safe value handling from server permission enforcement."], starter: parameters(true), reference: parameters(), faulty: parameters(true), cases: parameterCases("bound-inventory-values", 0), debugCases: parameterCases("bound-inventory-values-debug", 0).slice().reverse(), transfer: [1, 2].map(index => ({ task: `Parameterise both reads and writes in ${inventoryContexts[index]!.title}. Preserve exact-key semantics, valid zero, unrelated locations and unchanged state for inert quote-containing values.`, starter: parameters(true), reference: parameters(), cases: parameterCases(`new-bound-inventory-${index}`, index) })), prediction: { prompt: "The SELECT binds its values, but UPDATE still concatenates the item ID. Is the service's SQL input boundary repaired?", choices: ["Yes", "Only the SELECT matters", "No, bind the write values too"], correct: 2 },
});
function transfer(faulty = false) { return inventoryArtifact(`from inventory_db import connect,seed,snapshot
def solve(data):
    database=connect()
    seed(database,data['quantity'])
    before=snapshot(database)
    ${faulty ? "# Incorrect autocommit permits a half-transfer." : "database.execute('BEGIN')"}
    try:
        changed=database.execute('UPDATE stock SET quantity=quantity-? WHERE item_id=? AND location_id=? AND quantity>=?',(data['move'],'paper','store',data['move'])).rowcount
        if changed!=1: raise ValueError('insufficient-stock')
        if data['interrupt']: raise ValueError('injected-fixture-failure')
        database.execute('UPDATE stock SET quantity=quantity+? WHERE item_id=? AND location_id=?',(data['move'],'paper','workshop'))
        ${faulty ? "# No atomic commit boundary." : "database.execute('COMMIT')"}
        status='accepted'
    except ValueError:
        ${faulty ? "# A caught error does not reverse the committed debit." : "database.execute('ROLLBACK')"}
        status='refused'
    after=snapshot(database)
    database.close()
    return {'status':status,'before':before,'after':after,'total':sum(row['quantity'] for row in after)}
`); }
function transferCases(id: string, index: number) { const c = inventoryContexts[index]!; return [{ move: c.move, interrupt: false, accepted: true }, { move: c.move, interrupt: true, accepted: false }, { move: c.initial + 1, interrupt: false, accepted: false }].map((input, variant) => scenario(`${id}-${variant}`, { quantity: c.initial, move: input.move, interrupt: input.interrupt }, eq("result.status", input.accepted ? "accepted" : "refused", "The actual transfer reports success only when both related changes commit"), eq("result.after", [{ item: "paper", location: "store", quantity: c.initial - (input.accepted ? input.move : 0), revision: 0 }, { item: "paper", location: "workshop", quantity: input.accepted ? input.move : 0, revision: 0 }], "The real transaction applies both debit and credit or rolls back the interrupted/insufficient operation completely"), eq("result.total", c.initial, "Total synthetic stock is actually conserved across every accepted or refused transfer"))); }
const transactions = authorLesson({ id: "Y10.09", workbench: "python", concepts: ["transaction", "invariant", "atomicity", "rollback", "failure injection"],
  explanation: "Preserve total stock while transferring a supplied quantity from the fictional store to workshop. Use a real SQLite transaction: begin, conditionally debit only sufficient store stock, credit the workshop and commit. Roll back on insufficient stock or the explicitly injected teaching failure after debit. The seeded autocommit implementation catches the error but leaves the debit committed, losing stock from the total. Repair the transaction boundary and execute successful, interrupted and insufficient cases. Inspect actual persisted rows and the conserved total rather than a success flag alone. Independent inventories change initial stock and transfer size. Failure injection is confined to the isolated synthetic service; no application database or real inventory is touched. Explain that an exception handler alone is not an atomicity mechanism and cannot reverse an earlier committed statement.",
  reasoning: ["An invariant spanning two writes needs an atomic boundary; individually valid statements can still leave an invalid combined state.", "Injecting a failure between related writes demonstrates rollback behaviour that a successful happy path cannot prove."], starter: transfer(true), reference: transfer(), faulty: transfer(true), cases: transferCases("atomic-stock-transfer", 0), debugCases: transferCases("atomic-stock-transfer-debug", 0).slice(1), transfer: [1, 2].map(index => ({ task: `Transfer ${inventoryContexts[index]!.move} units from initial stock ${inventoryContexts[index]!.initial} with a real atomic transaction. Verify success, interruption and insufficient stock while conserving the actual total.`, starter: transfer(true), reference: transfer(), cases: transferCases(`new-atomic-transfer-${index}`, index) })), prediction: { prompt: "Debit committed, then credit failed. Does catching the exception alone restore stock?", choices: ["No, use a transaction and rollback", "Yes, every exception undoes SQL", "Only the status caption matters"], correct: 0 },
});
export const inventoryDatabaseActivities = [normalization, parameterized, transactions];
export const inventoryDatabaseTools = { normalized, normalizationCases, parameters, parameterCases, transfer, transferCases };
