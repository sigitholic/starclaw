"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { matchIntentToSkill, coerceForbiddenToolsToSkill } = require("../../core/agent/intent.skill.match");
const { selectRelevantTools, mergePlannerSchemas } = require("../../core/agent/tool.selector");
const { createDefaultSkillRegistry } = require("../../core/skills/skill.runtime.registry");
const { createToolRegistry } = require("../../core/tools");

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

test("matchIntentToSkill: typo crk kondisi → check-system-health", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("Crk kondisi server", reg);
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

test("matchIntentToSkill: cek status → check-system-health", () => {
  const reg = createDefaultSkillRegistry();
  const raw = matchIntentToSkill("cek status sistem", reg);
  assert.ok(raw);
  assert.equal(raw.skill_name, "check-system-health");
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
