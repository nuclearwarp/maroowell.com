import { DurableObject } from "cloudflare:workers";
// Phase 2A: isolated persistent session namespace. No credentials or
// sessions can be created until the authenticated API is separately enabled.
export class SessionStore extends DurableObject {
  async ping() { return true; }
}
