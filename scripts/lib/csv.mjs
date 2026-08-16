export function parseDelimited(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field === "") quoted = true;
    else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
      if (row.some((item) => item !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.endsWith("\r") ? field.slice(0, -1) : field);
    rows.push(row);
  }
  return rows;
}

export function parseCsvRecords(text, delimiter = ";") {
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return [];
  const headers = rows[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  return rows.slice(1).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

export function stringifyCsv(columns, rows) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const raw = Array.isArray(value) ? value.join("|") : String(value);
    const text = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return `${columns.map(escape).join(",")}\n${rows.map((row) => columns.map((column) => escape(row[column])).join(",")).join("\n")}${rows.length ? "\n" : ""}`;
}
