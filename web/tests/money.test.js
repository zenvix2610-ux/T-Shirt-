import assert from "node:assert/strict";
import test from "node:test";
import { money } from "../src/money.js";

test("formats prices as Indian rupees", () => {
  assert.equal(money(649), "₹649");
});

test("formats larger prices with Indian digit grouping", () => {
  assert.equal(money(12500), "₹12,500");
});
