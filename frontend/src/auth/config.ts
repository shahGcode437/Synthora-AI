// Accounts (sign in, sign up, saved schemas/datasets/history) are switched on with VITE_ACCOUNTS_ENABLED=true.
// Off by default: the generator works for everyone and no account UI or account request is shown or made.
export const ACCOUNTS_ENABLED = import.meta.env.VITE_ACCOUNTS_ENABLED === "true";
