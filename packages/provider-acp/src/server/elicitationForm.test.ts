import { assert, describe, it } from "@effect/vitest";

import { acpElicitationContent, acpElicitationForm } from "./elicitationForm.ts";

// Shape produced by oh-my-pi's `ask` tool: titled `oneOf` / `anyOf` choices plus
// a sibling `<id>__other` free-text property.
const ompProperties = {
  q0: {
    type: "string",
    title: "Which scope?",
    description: "Scope",
    oneOf: [
      { const: "Narrow", title: "Narrow", description: "Only this file" },
      { const: "Wide", title: "Wide" },
    ],
    default: "Narrow",
  },
  q0__other: { type: "string", title: "Other" },
  q1: {
    type: "array",
    title: "Which checks?",
    items: {
      anyOf: [
        { const: "lint", title: "lint" },
        { const: "test", title: "test" },
      ],
    },
  },
  q1__other: { type: "string", title: "Other" },
};

describe("acpElicitationForm", () => {
  it("surfaces oneOf/anyOf choices and folds __other into the choice question", () => {
    const form = acpElicitationForm(ompProperties, "Answer 2 questions");

    assert.deepStrictEqual(
      form.questions.map((q) => [q.id, q.options.map((o) => o.label), q.multiSelect ?? false]),
      [
        ["q0", ["Narrow", "Wide"], false],
        ["q1", ["lint", "test"], true],
      ],
    );
    assert.strictEqual(form.questions[0]?.options[0]?.description, "Only this file");
  });

  it("routes free-text answers to __other and choices to the property", () => {
    const form = acpElicitationForm(ompProperties, "Answer 2 questions");

    assert.deepStrictEqual(acpElicitationContent({ q0: "Narrow", q1: ["lint", "test"] }, form), {
      q0: "Narrow",
      q1: ["lint", "test"],
    });
    assert.deepStrictEqual(acpElicitationContent({ q0: "something else", q1: "custom" }, form), {
      q0__other: "something else",
      q1__other: "custom",
    });
  });

  it("keeps __other as its own question when its choice property has no options", () => {
    const form = acpElicitationForm({ q0: { type: "string" }, q0__other: { type: "string" } }, "m");
    assert.deepStrictEqual(
      form.questions.map((q) => q.id),
      ["q0", "q0__other"],
    );
  });

  it("keeps plain enum and boolean handling", () => {
    const form = acpElicitationForm(
      { pick: { type: "string", enum: ["a", "b"] }, ok: { type: "boolean" } },
      "m",
    );
    assert.deepStrictEqual(
      form.questions.map((q) => q.options.map((o) => o.label)),
      [
        ["a", "b"],
        ["true", "false"],
      ],
    );
    assert.deepStrictEqual(acpElicitationContent({ pick: "a", ok: false, nope: "x" }, form), {
      pick: "a",
      ok: false,
    });
  });
});
