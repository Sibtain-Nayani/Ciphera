import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "/api",
  timeout: 30000,
});

async function handleError(err) {
  // normalize axios error
  if (err?.response?.data) throw err.response.data;
  if (err?.message) throw { error: err.message };
  throw err;
}

export async function anonymize({ text, file, technique = "mask", onUploadProgress } = {}) {
  try {
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("technique", technique);
      const res = await API.post("/anonymize/file", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress,
      });
      return res.data;
    } else if (text) {
      const res = await API.post("/anonymize/text", { text, technique });
      return res.data;
    } else {
      throw { error: "No input provided" };
    }
  } catch (err) {
    await handleError(err);
  }
}

export default API;