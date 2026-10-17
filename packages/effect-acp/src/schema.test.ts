import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import * as V1 from "./_generated/schema-v1.gen.ts";
import * as V2 from "./schema.ts";

describe("pinned ACP wire schemas", () => {
  it("validates known content variants without accepting malformed ones as future content", () => {
    const accepts = Schema.is(V2.ContentBlock);
    expect(accepts({ type: "text", text: "hello" })).toBe(true);
    expect(accepts({ type: "text" })).toBe(false);
    expect(accepts({ type: "image", data: "aGVsbG8=" })).toBe(false);
    expect(accepts({ type: "future_content", payload: { value: 1 } })).toBe(true);
  });

  it("requires both the elicitation scope and the selected mode's fields", () => {
    const accepts = Schema.is(V2.CreateElicitationRequest);
    const form = {
      sessionId: "session-1",
      mode: "form",
      message: "Choose a branch",
      requestedSchema: { type: "object", properties: {} },
    };
    expect(accepts(form)).toBe(true);
    expect(accepts({ ...form, requestedSchema: undefined })).toBe(false);
    expect(accepts({ ...form, sessionId: undefined })).toBe(false);
    expect(accepts({ sessionId: "session-1", mode: "url", message: "Sign in" })).toBe(false);
  });

  it("accepts titled single- and multi-select choices in an elicitation form", () => {
    // Shape sent by oh-my-pi's `ask` tool: `oneOf` choices, array `items.anyOf`
    // choices, and a free-text sibling property.
    const form = {
      sessionId: "session-1",
      mode: "form",
      message: "Answer 2 questions",
      requestedSchema: {
        type: "object",
        properties: {
          q0: {
            type: "string",
            title: "Which scope?",
            oneOf: [{ const: "Narrow", title: "Narrow", description: "Only this file" }],
          },
          q1: {
            type: "array",
            title: "Which checks?",
            items: { anyOf: [{ const: "lint", title: "lint" }] },
          },
          q1__other: { type: "string", title: "Other" },
        },
      },
    };
    expect(Schema.is(V2.CreateElicitationRequest)(form)).toBe(true);
    expect(Schema.is(V1.CreateElicitationRequest)(form)).toBe(true);
    const emptyChoices = structuredClone(form);
    emptyChoices.requestedSchema.properties.q1.items = { anyOf: [] };
    expect(Schema.is(V2.CreateElicitationRequest)(emptyChoices)).toBe(false);
  });

  it("keeps v1 command inputs compatible with native agents", () => {
    const command = { name: "plan", description: "Make a plan", input: { hint: "Task" } };
    expect(Schema.is(V1.AvailableCommand)(command)).toBe(true);
    expect(
      Schema.is(V2.AvailableCommand)({ ...command, input: { type: "text", hint: "Task" } }),
    ).toBe(true);
  });
});
