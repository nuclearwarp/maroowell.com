import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const p=readFileSync(".diagnostics/building_v754/patch_v757.py","utf8");
assert(p.includes("AptListService4/getLegaldongAptList4"));
assert(p.includes("AptBasisInfoServiceV5/getAphusBassInfoV5"));
assert(p.includes("AptBasisInfoServiceV5/getAphusDtlInfoV5"));
assert(p.includes("V757_KAPT_LIVE_V4_V5_ENDPOINTS"));
assert(!p.includes("https://apis.data.go.kr/1613000/AptListService3"));
console.log("PASS: official current K-APT v4 list and V5 basic/detail endpoints, guarded patch");
