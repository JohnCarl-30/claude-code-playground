import { test } from "node:test";
import assert from "node:assert/strict";
import { subtotal, applyDiscount, total } from "./cart.js";

const items = [
  { name: "Mug", price: 12, quantity: 2 },
  { name: "Tea", price: 6, quantity: 1 },
];

test("subtotal adds price x quantity", () => {
  assert.equal(subtotal(items), 30);
});

test("SAVE10 takes 10 percent off", () => {
  assert.equal(applyDiscount(200, "SAVE10"), 180);
});

test("unknown codes change nothing", () => {
  assert.equal(applyDiscount(30, "NOPE"), 30);
});

test("total applies discount then tax", () => {
  assert.equal(total(items, "SAVE10"), 29.16);
});

test("HALFOFF takes 50 percent off", () => {
  assert.equal(applyDiscount(80, "HALFOFF"), 40);
});
