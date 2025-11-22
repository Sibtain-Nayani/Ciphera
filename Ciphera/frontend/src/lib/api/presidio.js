import API from "./client";

const normalize = (data) => ({
  ...data,
  detected_entities: data?.detected_entities || data?.detections || [],
});

export async function getHealth() {
  const { data } = await API.get("/health");
  return data;
}

export async function getEntities() {
  const { data } = await API.get("/entities");
  return data?.entities ?? [];
}

function appendCommon(form, { technique, entities }) {
  if (technique) form.append("technique", technique);
  if (entities?.length) form.append("entities", JSON.stringify(entities));
}

export async function anonymizeText({ text, technique = "mask", entities } = {}) {
  if (!text) throw new Error("Text is required");
  const form = new FormData();
  form.append("text", text);
  appendCommon(form, { technique, entities });
  const { data } = await API.post("/anonymize", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return normalize(data);
}

export async function anonymizeFile({ file, technique = "mask", entities, onUploadProgress } = {}) {
  if (!file) throw new Error("File is required");
  const form = new FormData();
  form.append("file", file);
  appendCommon(form, { technique, entities });
  const { data } = await API.post("/anonymize", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });
  return normalize(data);
}

export async function batchAnonymize(files = [], { technique = "mask" } = {}) {
  if (!files.length) throw new Error("At least one file is required");
  const form = new FormData();
  files.forEach((file) => form.append("files", file));
  form.append("technique", technique);
  const { data } = await API.post("/batch-anonymize", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data?.results ?? [];
}

export async function extractText({ file }) {
  if (!file) throw new Error("File is required");
  const form = new FormData();
  form.append("file", file);
  const { data } = await API.post("/extract-text", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getJobs() {
  const { data } = await API.get("/jobs");
  return data ?? [];
}
