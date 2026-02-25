import axios from "axios";

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "http://localhost:8000/api",
  timeout: 30000,
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const normalized =
      error?.response?.data ??
      error?.message ??
      "Unexpected network error. Is the FastAPI server running?";
    return Promise.reject(normalized);
  }
);

export default API;
