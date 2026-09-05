import assert from "node:assert/strict";
import test from "node:test";
import { makeSyncOperation, retryDelay } from "./queue.ts";

test("sync operation keeps the local mutation for retry", () => {
  const operation = makeSyncOperation("employees", "employee-1", "UPSERT", { code: "00123" });
  assert.equal(operation.entityType, "employees");
  assert.equal(operation.entityId, "employee-1");
  assert.deepEqual(JSON.parse(operation.payload), { code: "00123" });
  assert.equal(operation.attempts, 0);
});

test("sync retry uses bounded exponential backoff", () => {
  assert.equal(retryDelay(1), 2_000);
  assert.equal(retryDelay(2), 4_000);
  assert.equal(retryDelay(20), 300_000);
});
