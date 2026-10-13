// Mirrors backend/app/auth/passwords.py so users see the same rules before submitting. The server remains the authority.
export const MIN_LEN = 10;
export const MAX_LEN = 128;

export interface PasswordRule { id: string; label: string; ok: boolean }

export function passwordRules(password: string, email = "", name = ""): PasswordRule[] {
  const low = password.toLowerCase();
  const compactName = name.toLowerCase().replace(/\s+/g, "");
  return [
    { id: "length", label: `At least ${MIN_LEN} characters`, ok: password.length >= MIN_LEN && password.length <= MAX_LEN },
    { id: "mix", label: "A letter and a number", ok: /[A-Za-z]/.test(password) && /\d/.test(password) },
    { id: "varied", label: "Not repetitive", ok: new Set(password).size >= 4 },
    { id: "personal", label: "Doesn't contain your name or email", ok: !(
      (email && low === email.toLowerCase()) || (compactName.length >= 4 && low.replace(/\s+/g, "").includes(compactName))) },
  ];
}

export const passwordOk = (password: string, email = "", name = "") => passwordRules(password, email, name).every((r) => r.ok);

/** 0 (empty) to 4. Only counts rules that are satisfied plus a bonus for length: a hint, not a guarantee. */
export function passwordStrength(password: string, email = "", name = ""): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!password) return { score: 0, label: "" };
  const met = passwordRules(password, email, name).filter((r) => r.ok).length;
  let score = Math.max(1, met - 1) as 1 | 2 | 3 | 4;
  if (met === 4 && password.length >= 14) score = 4;
  else if (met === 4) score = 3;
  else if (met < 3) score = Math.min(score, 2) as 1 | 2;
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

export const validEmail = (v: string) => v.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(v.trim());
