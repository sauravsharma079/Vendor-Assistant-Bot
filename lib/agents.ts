// Fixed business support roster — there's no per-user login yet (business
// support shares one password), so ticket assignment is to a name from
// this list rather than a real account. Swap for a real user directory
// (with real emails) once individual accounts exist.
//
// All four route to the same shared inbox for now — update this mapping
// once each agent has their own real address.
export const AGENTS = ["Priya Nair", "Rahul Mehta", "Vikram Rao", "Sanya Kapoor"] as const;

const SHARED_AGENT_INBOX = "source2pay.ai@gmail.com";

export const AGENT_EMAILS: Record<string, string> = {
  "Priya Nair": SHARED_AGENT_INBOX,
  "Rahul Mehta": SHARED_AGENT_INBOX,
  "Vikram Rao": SHARED_AGENT_INBOX,
  "Sanya Kapoor": SHARED_AGENT_INBOX,
};
