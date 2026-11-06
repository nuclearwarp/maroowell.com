import { DurableObject } from "cloudflare:workers";

const LIFETIME_MS = 12 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export class SessionStore extends DurableObject {
  async ping() {
    return true;
  }
  async issue(record) {
    if (!record || typeof record.userId !== "string" || typeof record.accessToken !== "string" ||
        typeof record.refreshToken !== "string" || typeof record.csrfToken !== "string" ||
        record.accessToken.length < 16 || record.refreshToken.length < 16 ||
        !Number.isSafeInteger(record.expiresAt) || record.expiresAt <= Date.now()) {
      return false;
    }
    const existing = await this.ctx.storage.get("session");
    if (existing) return false;
    const session = {...record, absoluteExpiresAt:Date.now()+LIFETIME_MS};
    await this.ctx.storage.put("session",session);
    await this.ctx.storage.setAlarm(session.absoluteExpiresAt);
    return true;
  }
  async read() {
    const row = await this.ctx.storage.get("session");
    if (!row) return null;
    if (Date.now() >= row.absoluteExpiresAt) {
      await this.ctx.storage.delete("session");
      return null;
    }
    return row;
  }
  async replaceTokens(oldRefreshToken, replacement) {
    const row=await this.read();
    if (!row || row.refreshToken !== oldRefreshToken ||
        !replacement || typeof replacement.accessToken !== "string" ||
        typeof replacement.refreshToken !== "string" ||
        !Number.isSafeInteger(replacement.expiresAt)) return false;
    await this.ctx.storage.put("session",{
      ...row, accessToken:replacement.accessToken,
      refreshToken:replacement.refreshToken,expiresAt:replacement.expiresAt
    });
    return true;
  }
  async revoke() {
    await this.ctx.storage.delete("session");
    return true;
  }
  async attempt() {
    const now=Date.now();
    let state=await this.ctx.storage.get("rate");
    if (!state || now >= state.until) state={count:0,until:now+RATE_WINDOW_MS};
    if (state.count >= 10) return {allowed:false,retryAfter:Math.ceil((state.until-now)/1000)};
    state.count+=1;
    await this.ctx.storage.put("rate",state);
    await this.ctx.storage.setAlarm(state.until);
    return {allowed:true};
  }
  async resetAttempts() {
    await this.ctx.storage.delete("rate");
  }
  async alarm() {
    const now=Date.now();
    const row=await this.ctx.storage.get("session");
    if (row && row.absoluteExpiresAt <= now) await this.ctx.storage.delete("session");
    const rate=await this.ctx.storage.get("rate");
    if (rate && rate.until <= now) await this.ctx.storage.delete("rate");
    const alarms=[row && row.absoluteExpiresAt>now?row.absoluteExpiresAt:null,
      rate && rate.until>now?rate.until:null].filter(Boolean);
    if (alarms.length) await this.ctx.storage.setAlarm(Math.min(...alarms));
  }
}
