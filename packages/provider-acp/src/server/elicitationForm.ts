import type {
  OrchestrationV2UserInputQuestion,
  ProviderUserInputAnswers,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/compat";

import { unknownRecord } from "./clientPolicy.ts";

/**
 * Suffix some agents (oh-my-pi's `ask` tool) append to a choice property id to
 * carry a free-text "Other" answer next to the choice. T3 folds it into the
 * choice question's custom answer instead of rendering a second, option-less
 * question.
 */
const OTHER_KEY_SUFFIX = "__other";

type QuestionOption = OrchestrationV2UserInputQuestion["options"][number];

interface ElicitationField {
  /** Choice values the agent accepts; any other answer is free text. */
  readonly optionValues: ReadonlySet<string>;
  /** Property that receives a free-text answer, when the form declares one. */
  readonly otherKey: string | undefined;
}

export interface AcpElicitationForm {
  readonly questions: ReadonlyArray<OrchestrationV2UserInputQuestion>;
  readonly fields: ReadonlyMap<string, ElicitationField>;
}

function nonEmptyText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function titledOptions(value: unknown): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  const options: QuestionOption[] = [];
  for (const entry of value) {
    const record = unknownRecord(entry);
    if (typeof record?.const !== "string" || record.const.trim().length === 0) continue;
    const label = nonEmptyText(record.title, record.const);
    options.push({
      label,
      description: nonEmptyText(record.description, label),
      ...(label === record.const ? {} : { value: record.const }),
    });
  }
  return options;
}

/** `enum`, titled `oneOf`/`anyOf` choices (JSON Schema `const` + `title`). */
function choiceOptions(schema: Record<string, unknown> | undefined): QuestionOption[] {
  if (schema === undefined) return [];
  if (Array.isArray(schema.enum)) {
    return schema.enum
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => ({ label: value, description: value }));
  }
  const titled = titledOptions(schema.oneOf);
  return titled.length > 0 ? titled : titledOptions(schema.anyOf);
}

function propertyOptions(record: Record<string, unknown> | undefined): {
  readonly options: QuestionOption[];
  readonly multiSelect: boolean;
} {
  if (record?.type === "array") {
    return { options: choiceOptions(unknownRecord(record.items)), multiSelect: true };
  }
  const options = choiceOptions(record);
  if (options.length > 0) return { options, multiSelect: false };
  return {
    options:
      record?.type === "boolean"
        ? [
            { label: "true", description: "Yes" },
            { label: "false", description: "No" },
          ]
        : [],
    multiSelect: false,
  };
}

/** Maps an ACP `elicitation/create` form schema onto T3 user-input questions. */
export function acpElicitationForm(
  properties: Record<string, unknown>,
  message: string,
): AcpElicitationForm {
  const parsed = Object.entries(properties).map(([id, property]) => ({
    id,
    record: unknownRecord(property),
    ...propertyOptions(unknownRecord(property)),
  }));
  const choiceIds = new Set(parsed.filter((entry) => entry.options.length > 0).map((e) => e.id));
  const foldedOtherKeys = new Set<string>();
  for (const id of choiceIds) {
    if (id.endsWith(OTHER_KEY_SUFFIX)) continue;
    const otherKey = `${id}${OTHER_KEY_SUFFIX}`;
    if (otherKey in properties && !choiceIds.has(otherKey)) foldedOtherKeys.add(otherKey);
  }

  const questions: OrchestrationV2UserInputQuestion[] = [];
  const fields = new Map<string, ElicitationField>();
  for (const { id, record, options, multiSelect } of parsed) {
    if (foldedOtherKeys.has(id)) continue;
    const otherKey = `${id}${OTHER_KEY_SUFFIX}`;
    fields.set(id, {
      optionValues: new Set(options.map((option) => option.value ?? option.label)),
      otherKey: foldedOtherKeys.has(otherKey) ? otherKey : undefined,
    });
    questions.push({
      id,
      header: nonEmptyText(record?.title, `Question ${questions.length + 1}`),
      question: nonEmptyText(record?.description, message),
      options,
      ...(multiSelect ? { multiSelect: true } : {}),
    });
  }
  return { questions, fields };
}

/**
 * Builds the `elicitation/create` response content. Answers outside a field's
 * choice values go to its declared free-text property, which the agent reads in
 * preference to the choice.
 */
export function acpElicitationContent(
  answers: ProviderUserInputAnswers,
  form: AcpElicitationForm,
): Record<string, EffectAcpSchema.ElicitationContentValue> {
  const content: Record<string, EffectAcpSchema.ElicitationContentValue> = {};
  for (const [key, value] of Object.entries(answers)) {
    const field = form.fields.get(key);
    if (field === undefined) continue;
    if (field.otherKey !== undefined && typeof value === "string" && field.optionValues.size > 0) {
      if (!field.optionValues.has(value)) {
        content[field.otherKey] = value;
        continue;
      }
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      content[key] = value;
    } else if (Array.isArray(value)) {
      content[key] = value.filter((entry): entry is string => typeof entry === "string");
    }
  }
  return content;
}
