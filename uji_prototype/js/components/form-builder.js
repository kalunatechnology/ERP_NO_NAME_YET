/**
 * Dynamic Form Builder Component
 */

import { esc, attr } from "../utils/dom.js";

export function renderFormFields(fields = []) {
  if (!fields.length) {
    return `<label class="field full"><span>JSON payload</span><textarea name="__raw" class="json-editor">{}</textarea></label>`;
  }

  return fields.map(renderField).join("");
}

export function renderField(f) {
  const mark = f.required ? '<span class="required">*</span>' : "";
  const help = f.description
    ? `<small class="help">${esc(f.description)}</small>`
    : f.format === "uuid"
    ? '<small class="help">Masukkan UUID resource terkait.</small>'
    : "";

  if (f.type === "boolean") {
    return `
      <label class="field">
        <span>${esc(f.label)} ${mark}</span>
        <span class="check"><input type="checkbox" name="${attr(f.name)}" ${f.value === true ? "checked" : ""}> Aktif</span>
        ${help}
      </label>
    `;
  }

  if (f.enum?.length || f.options?.length) {
    const opts = f.enum || f.options;
    return `
      <label class="field">
        <span>${esc(f.label)} ${mark}</span>
        <select name="${attr(f.name)}">
          ${!f.required ? '<option value="">— Kosong —</option>' : ""}
          ${opts
            .map(opt => {
              const val = typeof opt === "object" ? opt.value : opt;
              const lbl = typeof opt === "object" ? opt.label : opt;
              const isSel = String(val) === String(f.value);
              return `<option ${isSel ? "selected" : ""} value="${attr(val)}">${esc(lbl)}</option>`;
            })
            .join("")}
        </select>
        ${help}
      </label>
    `;
  }

  if (f.type === "object" || f.type === "array") {
    const v =
      f.value && typeof f.value === "object"
        ? JSON.stringify(f.value, null, 2)
        : f.value || (f.type === "array" ? "[]" : "{}");
    return `
      <label class="field full">
        <span>${esc(f.label)} ${mark}</span>
        <textarea class="json-editor" name="${attr(f.name)}">${esc(v)}</textarea>
        ${help || '<small class="help">Isi sebagai JSON valid.</small>'}
      </label>
    `;
  }

  const type =
    f.type === "integer" || f.type === "number"
      ? "number"
      : f.format === "email"
      ? "email"
      : f.format === "date"
      ? "date"
      : f.format === "date-time"
      ? "datetime-local"
      : /password/i.test(f.name)
      ? "password"
      : "text";

  const v = f.format === "date-time" && typeof f.value === "string" ? f.value.slice(0, 16) : f.value;

  return `
    <label class="field">
      <span>${esc(f.label)} ${mark}</span>
      <input type="${type}" name="${attr(f.name)}" value="${attr(v ?? "")}" ${f.required ? "required" : ""} ${type === "number" ? 'step="any"' : ""}>
      ${help}
    </label>
  `;
}
