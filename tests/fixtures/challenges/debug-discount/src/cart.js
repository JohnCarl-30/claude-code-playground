export const TAX_RATE = 0.08;

export const DISCOUNT_CODES = {
  SAVE10: 10, // percent off
  HALFOFF: 50,
};

export function subtotal(items) {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function applyDiscount(amount, code) {
  const percent = DISCOUNT_CODES[code];
  if (!percent) return amount;
  return amount * (1 - percent / 100);
}

export function total(items, code) {
  const discounted = applyDiscount(subtotal(items), code);
  return Math.round(discounted * (1 + TAX_RATE) * 100) / 100;
}
