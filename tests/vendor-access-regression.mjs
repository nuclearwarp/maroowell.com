import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync("worker.js", "utf8");
const menu = fs.readFileSync("public/board-menu.js", "utf8");
const html = fs.readFileSync("public/vendors.html", "utf8");

function extract(start, next) {
  const a = worker.indexOf(start);
  const b = worker.indexOf(next, a + start.length);
  assert(a >= 0 && b > a, "Expected unique function boundaries: " + start);
  return worker.slice(a, b);
}
const routeError = (status, text) => Object.assign(new Error(text), { status });

async function permissions({ profile, clhi, userAccess, level = 0, hasVendor = true }) {
  const code = extract("async function vendorPermissionSnapshot(", "async function requireVendorAdminAccess(");
  const f = new Function(
    "routeAuthUser", "routeFirstRow", "routeMaroowellVendor", "routeHttpError",
    code + "\nreturn vendorPermissionSnapshot;"
  )(
    async () => ({ id: "test-user" }),
    async (_env, table) => ({
      profiles: profile,
      cleansing_history_access: clhi,
      user_access: userAccess,
      vendor_members: { role_level: level, is_active: true }
    })[table],
    async () => hasVendor ? { id: "test-vendor" } : null,
    routeError
  );
  return f({ headers: {} }, {});
}

const approved = { approval_status: "approved", app_only: false };
const noRole = { is_maroowell: false, is_admin: false };
const clhiOnly = await permissions({ profile: approved, clhi: { can_select: true }, userAccess: noRole });
assert.equal(clhiOnly.canViewDetails, true);
assert.equal(clhiOnly.canEdit, true);
assert.equal(clhiOnly.canDelete, true);
assert.equal(clhiOnly.canCreate, false, "CLHI grant must not allow vendor creation");

const viewer = await permissions({ profile: approved, clhi: { can_select: false }, userAccess: noRole });
assert.equal(viewer.canEdit, false);
assert.equal(viewer.canDelete, false);
assert.equal(viewer.canCreate, false);
const administrator = await permissions({ profile: approved, clhi: null, userAccess: { is_maroowell: true, is_admin: true }, level: 90 });
assert.equal(administrator.canCreate, true);
assert.equal(administrator.canDelete, true);
for (const profile of [{ approval_status: "pending", app_only: false }, { approval_status: "approved", app_only: true }]) {
  await assert.rejects(
    permissions({ profile, clhi: { can_select: true }, userAccess: noRole }),
    error => error.status === 403
  );
}

const listCode = extract("async function handleVendorsPublicView(", "async function handleVendorsAdminGet(");
const publicView = new Function("handleVendorsGet", "getVendorDetails", "json", listCode + "\nreturn handleVendorsPublicView;")(
  async () => ({ ok: true, json: async () => ({ rows: [{ id: "test-id", name: "ABC", nickname: "A", business_number: "100-00-00000", vendor_code: "internal", email: "private@example.test" }] }) }),
  async () => new Map([["test-id", { business_type: "Transport", business_category: "Delivery", vendor_representative: "Private", memo: "Private", company_address: "Private", email: "private@example.test" }]]),
  x => x
);
const publicResult = await publicView({ searchParams: {} }, {});
assert.equal(publicResult.rows.length, 1);
assert.equal(publicResult.rows[0].business_type, "Transport");
for (const secret of ["vendor_code", "vendor_representative", "memo", "company_address", "email"]) {
  assert.equal(Object.hasOwn(publicResult.rows[0], secret), false, "Public API leaked " + secret);
}

const usageCode = extract("async function vendorReferenceUsage(", "async function findVendorById(");
const checkUsage = new Function(
  "VENDOR_REFERENCE_SPECS", "supabaseFetch", "routeHttpError",
  usageCode + "\nreturn vendorReferenceUsage;"
)([["profiles", "default_vendor_id", "profile"]], async () => { throw new Error("DB unavailable"); }, routeError);
await assert.rejects(checkUsage({}, "test-id", true), error => error.status === 503);

assert.match(worker, /if\s*\(path === "\/vendors\/view"\)/);
assert.match(worker, /if\s*\(path === "\/vendors\/permissions"\)/);
assert.match(worker, /async function handleVendorsAdminGet\(request,url,env\)\s*\{\s*await requireVendorAdminAccess\(request,env\)/);
assert.match(worker, /async function handleVendorAdminCreate\(request,env\)\s*\{\s*await requireVendorCreatorAccess\(request,env\)/);
assert.match(worker, /const references = await vendorReferenceUsage\(env, vendorId, true\)/);
assert.match(menu, /key:"vendors",label:"벤더 조회",path:"\/vendors\.html",aliases:\["\/vendors","\/vendors\.html"\],public:true/);

new vm.Script(menu, { filename: "board-menu.js" });
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(Boolean);
for (const [i, source] of scripts.entries()) new vm.Script(source, { filename: "vendors inline " + i });
assert.match(html, /\/vendors\/view\?limit=1000/);
assert.match(html, /\/vendors\/permissions/);
assert.match(html, /\/vendors\/admin\/.*encodeURIComponent\(editId\)/);
assert.match(html, /\/vendors\/.*encodeURIComponent\(id\).*method:"DELETE"/);
assert.match(html, /id="add" class="primary" hidden/);

console.log("PASS: public vendor lookup, CLHI editor/delete, admin creator, denied accounts, redaction, deletion fail closed, frontend syntax");
