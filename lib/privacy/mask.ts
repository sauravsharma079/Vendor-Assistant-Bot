// Never log or display PAN, GSTIN, or email in full \u2014 these are
// sensitive identifiers even though they aren't strictly "secret". Used
// consistently in audit logs and UI copy so raw values never end up
// anywhere they don't need to be.

export function maskTaxId(value: string): string {
  const v = value.trim();
  if (v.length <= 4) return "*".repeat(v.length);
  return `${"*".repeat(v.length - 4)}${v.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}
