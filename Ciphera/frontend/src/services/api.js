export async function anonymize({ text, file, entities, technique }) {
  const url = "/api/anonymize";
  const form = new FormData();
  if (file) {
    form.append("file", file);
  } else {
    form.append("text", text || "");
  }

  if (entities) {
    form.append("entities", JSON.stringify(entities));
  }

  if (technique) {
    form.append("technique", technique);
  }

  const res = await fetch(url, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "API error");
  }
  return res.json();
}

export async function getSupportedEntities() {
  const url = "/api/entities";
  const res = await fetch(url);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "API error");
  }
  return res.json();
}