"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { plan, matchIntentToSkill } = require("../../core/agent/intent.skill.match");
const {
  patchSession,
  getSessionSnapshot,
  clearSession,
} = require("../../core/memory/shortMemory");
const { createDefaultSkillRegistry } = require("../../core/skills/skill.runtime.registry");

test("shortMemory: patch hanya mengubah key yang diberikan", () => {
  const sid = "test-short-memory-unit-1";
  clearSession(sid);
  patchSession(sid, { lastPingTarget: "192.168.88.20", other: "foo" });
  patchSession(sid, { lastPingTarget: "10.0.0.1" });
  const snap = getSessionSnapshot(sid);
  assert.equal(snap.lastPingTarget, "10.0.0.1");
  assert.equal(snap.other, "foo");
  clearSession(sid);
});

test("plan: ping lagi + memori sesi → reuse IP", () => {
  const mem = { lastPingTarget: "192.168.88.20" };
  const p = plan("ping lagi", mem);
  assert.equal(p.type, "skill");
  assert.equal(p.skill, "run-system-command");
  assert.equal(p.input.target, "192.168.88.20");
});

test("plan: ucapan singkat lagi + memori → ping ulang", () => {
  const p = plan("lagi", { lastPingTarget: "192.168.88.20" });
  assert.equal(p.type, "skill");
  assert.equal(p.input.target, "192.168.88.20");
});

test("plan: salam tidak tertangkap sebagai ping follow-up", () => {
  const p = plan("halo lagi", { lastPingTarget: "192.168.88.20" });
  assert.equal(p.type, "chat");
});

test("matchIntentToSkill: yang tadi dengan memori", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("yang tadi ping", reg, { lastPingTarget: "192.168.88.20" });
  assert.ok(raw);
  assert.equal(raw.skill_name, "run-system-command");
  assert.equal(raw.input.target, "192.168.88.20");
});
