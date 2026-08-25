// Fixed business support roster — there's no per-user login yet (business
// support shares one password), so ticket assignment is to a name from
// this list rather than a real account. Swap for a real user directory
// (with real emails) once individual accounts exist.
//
// Emails use the same +alias convention as the curated demo vendors, so
// assignment notifications actually land somewhere visible during local
// testing instead of a fictional address. Update these to real agent
// inboxes before using this with an actual business support team.
export const AGENTS = ["Priya Nair", "Rahul Mehta", "Vikram Rao", "Sanya Kapoor"] as const;

export const AGENT_EMAILS: Record<string, string> = {
  "Priya Nair": "sauravsharma079+priyanair@gmail.com",
  "Rahul Mehta": "sauravsharma079+rahulmehta@gmail.com",
  "Vikram Rao": "sauravsharma079+vikramrao@gmail.com",
  "Sanya Kapoor": "sauravsharma079+sanyakapoor@gmail.com",
};
