export function checkAdminPasscode(req, res) {
  const expected = process.env.ADMIN_PASSCODE || "";
  if (!expected) {
    return res
      .status(500)
      .json({ ok: false, error: "Admin passcode not configured" });
  }

  const provided = String(req.body?.passcode || "").trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, error: "Invalid passcode" });
  }

  res.json({ ok: true });
}
