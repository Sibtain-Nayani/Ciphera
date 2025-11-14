# app.py
# Streamlit Presidio Anonymizer — improved (fixes UploadedFile len() error + added Figma features)
import streamlit as st
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
import pandas as pd
import hashlib
import io
import html
from typing import List, Dict, Any, Union
import os

# -----------------------
# GLOBAL THEME OVERRIDE (Figma-like)
# -----------------------
PRIMARY = "#5C6AC4"


# -----------------------
# Helpers & initialization
# -----------------------
st.set_page_config(page_title="Ciphera — PII Anonymizer", layout="wide", initial_sidebar_state="expanded")

@st.cache_resource
def init_engines():
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
    return analyzer, anonymizer

analyzer, anonymizer = init_engines()

def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def build_operators(technique: str, replace_value: str = None) -> Dict:
    if technique == "Redact":
        return {"DEFAULT": OperatorConfig("redact")}
    if technique == "Replace":
        val = replace_value if replace_value is not None else "<REDACTED>"
        return {"DEFAULT": OperatorConfig("replace", {"new_value": val})}
    if technique == "Mask":
        return {"DEFAULT": OperatorConfig("replace", {"new_value": "********"})}
    if technique == "Hash":
        return {"DEFAULT": OperatorConfig("hash", {"hash_type": "sha256"})}
    return {"DEFAULT": OperatorConfig("redact")}

def highlight_diff(original: str, anonymized: str, entities: List[dict]) -> str:
    original_esc = html.escape(original)
    anonymized_esc = html.escape(anonymized)
    ents = sorted(entities, key=lambda e: e["start"])
    out_orig = []
    last = 0
    for e in ents:
        out_orig.append(html.escape(original[last:e["start"]]))
        out_orig.append(f"<mark title='{html.escape(e['span'])}'>{html.escape(original[e['start']:e['end']])}</mark>")
        last = e["end"]
    out_orig.append(html.escape(original[last:]))
    orig_html = "".join(out_orig).replace("\n", "<br/>")
    
    # Ensure anonymized text is properly escaped and formatted
    anon_html = anonymized_esc.replace("\n", "<br/>")
    
    html_block = f"""
    <div style="display:flex; gap:16px;">
      <div style="flex:1; border:1px solid #eee; padding:12px; border-radius:8px; background:#fafafa;">
        <h4 style="margin:4px 0;">Original</h4>
        <div style="font-family:monospace; font-size:14px; line-height:1.4;">{orig_html}</div>
      </div>
      <div style="flex:1; border:1px solid #eee; padding:12px; border-radius:8px; background:#fff;">
        <h4 style="margin:4px 0;">Anonymized</h4>
        <div style="font-family:monospace; font-size:14px; line-height:1.4;">{anon_html}</div>
      </div>
    </div>
    """
    return html_block

def normalize_uploaded(uploaded: Union[None, Any, List[Any]]) -> List[Any]:
    """
    Normalize the result of st.file_uploader to a list of UploadedFile objects (possibly empty).
    Avoid calling len() on an UploadedFile directly.
    """
    if not uploaded:
        return []
    if isinstance(uploaded, list):
        return uploaded
    # single UploadedFile
    return [uploaded]

def read_uploaded_text(f) -> str:
    """
    Read a stream or UploadedFile safely and return decoded string (utf-8 fallback).
    """
    try:
        data = f.read()
        if isinstance(data, bytes):
            return data.decode("utf-8", errors="replace")
        return str(data)
    except Exception:
        try:
            # try seeking and reading again (some UploadedFile objects allow this)
            f.seek(0)
            data = f.read()
            return data.decode("utf-8", errors="replace") if isinstance(data, (bytes, bytearray)) else str(data)
        except Exception:
            return ""

def analyze_and_anonymize_text(text: str, entities: List[str], technique: str, replace_value: str):
    results = analyzer.analyze(text=text, entities=entities, language="en")
    operators = build_operators(technique, replace_value)

    if technique == "Hash":
        # let anonymizer handle hash operator
        anon_result = anonymizer.anonymize(text=text, analyzer_results=results, operators=operators)
        audit = []
        for r in results:
            span = text[r.start:r.end]
            hashed = sha256_hex(span)
            audit.append({"entity": r.entity_type, "original": span, "anonymized": hashed, "start": r.start, "end": r.end})
        return anon_result.text, results, audit
    else:
        anon_result = anonymizer.anonymize(text=text, analyzer_results=results, operators=operators)
        audit = []
        for r in results:
            span = text[r.start:r.end]
            if technique == "Redact":
                anon_val = "[REDACTED]"
            elif technique == "Replace":
                anon_val = replace_value if replace_value else "<REDACTED>"
            elif technique == "Mask":
                anon_val = "********"
            else:
                anon_val = ""
            audit.append({"entity": r.entity_type, "original": span, "anonymized": anon_val, "start": r.start, "end": r.end})
        return anon_result.text, results, audit

# -----------------------
# Sidebar (Figma features)
# -----------------------
with st.sidebar:
    col_i1, col_i2, = st.columns([1,1])
    with col_i1:
        st.image("/home/sib/Desktop/Extras/Final ChaosCodez.png", width=160)  # add your logo path or remove
    with col_i2:
        st.markdown("""<div style='display:flex; gap:12px; align-items:center'><div></div><div><h2 class='header-title'>Ciphera</h2><div style='font-size:12px;color:gray'>PII anonymizer</div></div></div>""", unsafe_allow_html=True)
    st.write("---")
    technique = st.selectbox("Technique", ["Redact", "Replace", "Mask", "Hash"])
    replace_value = None
    if technique == "Replace":
        replace_value = st.text_input("Replacement token", "<REDACTED>")
    st.write("---")
    st.write("Entities")
    default_entities = ["PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD", "LOCATION", "DATE_TIME"]
    entity_multiselect = st.multiselect("Choose entities to detect", ["PERSON", "PHONE_NUMBER", "CREDIT_CARD", "EMAIL_ADDRESS", "LOCATION", "DATE_TIME", "IP_ADDRESS", "USERNAME"], default=default_entities)
    confidence = st.slider("Minimum confidence (analyzer)", 0.0, 1.0, 0.5, 0.05)
    st.write("---")
    st.checkbox("Batch mode (upload multiple files)", value=False, key="batch_mode")
    max_mb = st.number_input("Max file size (MB) per file", min_value=1, max_value=200, value=10)
    st.write("---")
    st.caption("Tip: Use Hash for audit mapping. Keep audit CSVs in secure storage.")
    st.write("\n")
    st.write("\n")

# -----------------------
# Main area
# -----------------------
st.title("Ciphera — PII Anonymizer")
st.markdown("Upload text files or paste text. Use the controls in the sidebar to tune detection and anonymization.")

# sample quick-load buttons (if you have sample files in repo)
col_s1, col_s2, col_s3 = st.columns([1,1,1])
with col_s1:
    if st.button("Load sample1"):
        try:
            sample_path = "sample1.txt"
            if os.path.exists(sample_path):
                with open(sample_path, "r", encoding="utf-8", errors="replace") as f:
                    st.session_state["pasted_text"] = f.read()
                    st.success("Loaded sample1 into text area.")
            else:
                st.warning("sample1.txt not found in working directory.")
        except Exception as e:
            st.error(str(e))
with col_s2:
    if st.button("Load sample2"):
        try:
            sample_path = "sample2.txt"
            if os.path.exists(sample_path):
                with open(sample_path, "r", encoding="utf-8", errors="replace") as f:
                    st.session_state["pasted_text"] = f.read()
                    st.success("Loaded sample2 into text area.")
            else:
                st.warning("sample2.txt not found.")
        except Exception as e:
            st.error(str(e))
with col_s3:
    if st.button("Clear pasted"):
        st.session_state["pasted_text"] = ""
        st.info("Cleared pasted text.")

pasted_text = st.text_area("Or paste text here (single document)", height=160, value=st.session_state.get("pasted_text", ""))

batch_mode = st.session_state.get("batch_mode", False)
uploaded_raw = st.file_uploader("Upload text file(s) (.txt)", type=["txt"], accept_multiple_files=batch_mode)
uploaded_files = normalize_uploaded(uploaded_raw)

# display uploaded file info (fixed len issue)
if uploaded_files:
    st.markdown("**Uploaded files:**")
    for uf in uploaded_files:
        # UploadedFile has .name and .size
        try:
            size = getattr(uf, "size", None)
            name = getattr(uf, "name", "unknown")
            size_kb = f"{size/1024:.1f} KB" if size else "unknown"
            st.write(f"- {name} — {size_kb}")
            if size and (size > max_mb * 1024 * 1024):
                st.warning(f"File {name} exceeds the max size of {max_mb} MB and may be skipped.")
        except Exception:
            st.write(f"- {getattr(uf,'name','file')}")
else:
    st.info("No files uploaded. Or paste text above.")

run_btn = st.button("Run Anonymization", key="run_btn")

# session audit
if "audit_rows" not in st.session_state:
    st.session_state["audit_rows"] = []

# Process action
if run_btn:
    # Build list of inputs
    inputs = []
    # uploaded files preferred
    if uploaded_files:
        inputs = uploaded_files
    elif pasted_text and pasted_text.strip():
        inputs = [io.BytesIO(pasted_text.encode("utf-8"))]
    else:
        st.warning("No input detected. Upload files or paste text.")
        inputs = []

    total = len(inputs)
    if total == 0:
        st.stop()

    progress = st.progress(0)
    for idx, inp in enumerate(inputs):
        fname = getattr(inp, "name", f"pasted_{idx}.txt")
        # read text
        if hasattr(inp, "read"):
            # UploadedFile: reading once is fine
            raw = read_uploaded_text(inp)
        else:
            # BytesIO or string-like
            try:
                raw = inp.getvalue().decode("utf-8", errors="replace")
            except Exception:
                raw = str(inp)

        # early file size sanity check
        if len(raw.encode("utf-8")) > max_mb * 1024 * 1024:
            st.warning(f"Skipping {fname}: exceeds {max_mb} MB (increase limit in sidebar).")
            progress.progress(int((idx + 1) / total * 100))
            continue

        # run analyze + anonymize
        anon_text, analyzer_results, audit = analyze_and_anonymize_text(raw, entity_multiselect, technique, replace_value or "")
        # attach filename to audit rows
        for a in audit:
            a["file"] = fname
        st.session_state["audit_rows"].extend(audit)

        # show preview
        with st.expander(f"Preview: {fname}", expanded=(idx == 0)):
            st.markdown(highlight_diff(raw, anon_text, [{"start": r.start, "end": r.end, "span": raw[r.start:r.end]} for r in analyzer_results]), unsafe_allow_html=True)
            c1, c2 = st.columns([1,1])
            with c1:
                st.download_button("Download anonymized", data=anon_text, file_name=f"{os.path.splitext(fname)[0]}_anonymized_{technique}.txt", mime="text/plain")
            with c2:
                if len(audit) > 0:
                    df_a = pd.DataFrame(audit)
                    csv_buf = df_a.to_csv(index=False).encode("utf-8")
                    st.download_button("Download audit CSV (this file)", data=csv_buf, file_name=f"{os.path.splitext(fname)[0]}_audit.csv", mime="text/csv")

        progress.progress(int((idx + 1) / total * 100))

    st.success(f"Processed {total} document(s).")

# Audit tab
st.markdown("---")
st.header("Audit / Logs")
rows = st.session_state.get("audit_rows", [])
if rows:
    df = pd.DataFrame(rows)
    st.dataframe(df, width='stretch')
    csv_all = df.to_csv(index=False).encode("utf-8")
    st.download_button("Download full audit CSV", data=csv_all, file_name=f"audit_log_{technique}.csv", mime="text/csv")
else:
    st.info("No audit rows yet — run anonymization to generate audit trails.")

if st.button("Clear audit log"):
    st.session_state["audit_rows"] = []
    st.experimental_rerun()

st.markdown("---")
st.caption("Hints: For production, add authentication, encrypted audit storage, and follow your privacy policy regarding raw PII storage.")
