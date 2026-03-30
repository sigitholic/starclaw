"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  matchIntentToSkill,
  coerceForbiddenToolsToSkill,
  plan,
  planUserIntent,
} = require("../../core/agent/intent.skill.match");
const { selectRelevantTools, mergePlannerSchemas } = require("../../core/agent/tool.selector");
const { createDefaultSkillRegistry } = require("../../core/skills/skill.runtime.registry");
const { createToolRegistry } = require("../../core/tools");

test("plan: pertanyaan umum → chat", () => {
  const p = plan("what is your name?");
  assert.equal(p.type, "chat");
  assert.equal(p.message, "what is your name?");
});

test("plan: list skills → chat", () => {
  const p = plan("list skills");
  assert.equal(p.type, "chat");
});

test("plan: cek list skill → chat (bukan check-server-resource karena kata server di skill)", () => {
  const p = plan("cek list skill");
  assert.equal(p.type, "chat");
});

test("plan: cek status server → check-server-resource", () => {
  const p = plan("cek status server");
  assert.equal(p.type, "skill");
  assert.equal(p.skill, "check-server-resource");
});

test("plan: salam → chat", () => {
  assert.equal(plan("halo").type, "chat");
  assert.equal(plan("malam").type, "chat");
  assert.equal(plan("Halo Clara").type, "chat");
});

test("plan: salam + kata kunci skill → tetap chat (salam lebih dulu)", () => {
  const p = plan("halo cek cpu");
  assert.equal(p.type, "chat");
  assert.equal(p.message, "halo cek cpu");
});

test("planUserIntent alias ke plan", () => {
  assert.deepEqual(planUserIntent("ping 1.1.1.1"), plan("ping 1.1.1.1"));
});

test("matchIntentToSkill: ping → run-system-command dengan target", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("ping 192.168.88.20", reg);
  assert.ok(raw);
  assert.equal(raw.action, "skill");
  assert.equal(raw.skill_name, "run-system-command");
  assert.equal(raw.input.target, "192.168.88.20");
});

test("matchIntentToSkill: frasa Indonesia ping ke IP", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("Lakukan ping ke 192.168.88.20", reg);
  assert.ok(raw);
  assert.equal(raw.skill_name, "run-system-command");
  assert.equal(raw.input.target, "192.168.88.20");
});

test("matchIntentToSkill: cek cpu server → check-server-resource", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("Cek CPU server", reg);
  assert.ok(raw);
  assert.equal(raw.skill_name, "check-server-resource");
});

test("matchIntentToSkill: cek kondisi server → check-server-resource", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("cek kondisi server", reg);
  assert.ok(raw);
  assert.equal(raw.skill_name, "check-server-resource");
});

test("matchIntentToSkill: cek status platform → check-system-health", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("cek status platform", reg);
  assert.ok(raw);
  assert.equal(raw.skill_name, "check-system-health");
});

test("coerceForbiddenToolsToSkill: shell-tool → run-system-command jika ada ping + IP", () => {
  const reg = createDefaultSkillRegistry();
  const out = coerceForbiddenToolsToSkill(
    { action: "tool", tool_name: "shell-tool", input: {} },
    "ping 10.0.0.1",
    reg,
  );
  assert.equal(out.action, "skill");
  assert.equal(out.skill_name, "run-system-command");
  assert.equal(out.input.target, "10.0.0.1");
});

test("coerceForbiddenToolsToSkill: shell-tool tanpa intent skill → respond", () => {
  const reg = createDefaultSkillRegistry();
  const out = coerceForbiddenToolsToSkill(
    { action: "tool", tool_name: "shell-tool", input: {} },
    "hello world no command",
    reg,
  );
  assert.equal(out.action, "respond");
});

test("matchIntentToSkill: cek status sistem tanpa kata kunci → null (chat)", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("cek status sistem", reg);
  assert.equal(raw, null);
});

test("selectRelevantTools: ping tidak memasukkan shell-tool jika run-system-command ada", () => {
  const tools = createToolRegistry([]);
  const skillReg = createDefaultSkillRegistry();
  const merged = mergePlannerSchemas(tools.getToolSchemas(), skillReg.getSkillSchemas());
  const selected = selectRelevantTools(merged, "ping 192.168.88.20", { requiredTools: [], previousTools: [] });
  const names = selected.map(s => s.name);
  assert.ok(names.includes("run-system-command"), "harus menyertakan skill run-system-command");
  assert.ok(!names.includes("shell-tool"), "tidak boleh memilih shell-tool bersamaan dengan skill ping");
});
