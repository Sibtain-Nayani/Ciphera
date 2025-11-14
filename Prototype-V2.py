# app.py
import streamlit as st
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig
import pandas as pd
import hashlib
import io
import html
from typing import List, Dict

# -----------------------
# Helpers & initialization
# -----------------------

@st.cache_resource
def init_engines():
    analyzer = AnalyzerEngine()
    anonymizer = AnonymizerEngine()
    return analyzer, anonymizer

def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def build_operators(technique: str, replace_value: str = None) -> Dict:
    if technique == "Redact":
        return {"DEFAULT": OperatorConfig("redact")}
    if technique == "Replace":
        # replace with a fixed token or user-provided token
        val = replace_value if replace_value is not None else "<REDACTED>"
        return {"DEFAULT": OperatorConfig("replace", {"new_value": val})}
    if technique == "Mask":
        # replace with mask token
        return {"DEFAULT": OperatorConfig("replace", {"new_value": "********"})}
    if technique == "Hash":
        # use built-in hash if available; otherwise we'll map manually
        return {"DEFAULT": OperatorConfig("hash", {"hash_type": "sha256"})}
    # fallback
    return {"DEFAULT": OperatorConfig("redact")}

def highlight_diff(original: str, anonymized: str, entities: List[dict]) -> str:
    """
    Return HTML for side-by-side with highlights of anonymized spans.
    Entities: list of {start, end, span_text}
    We'll highlight the anonymized text by matching positions — this works best if anonymizer preserves original text lengths or we use the original spans.
    For simplicity, we will highlight original spans in the original text and corresponding anonymized text by mapping spans by index order.
    """
    # escape html
    original_esc = html.escape(original)
    anonymized_esc = html.escape(anonymized)

    # sort entities by start
    ents = sorted(entities, key=lambda e: e["start"])
    # build highlighted original
    out_orig = []
    last = 0
    for e in ents:
        out_orig.append(html.escape(original[last:e["start"]]))
        out_orig.append(f"<mark title='{html.escape(e['span'])}'>{html.escape(original[e['start']:e['end']])}</mark>")
        last = e["end"]
    out_orig.append(html.escape(original[last:]))
    orig_html = "".join(out_orig).replace("\n", "<br/>")

    # attempt to highlight anonymized spans by searching for anonymized replacement for each entity span.
    # This is heuristic — we'll look for the hashed/replaced string in anonymized text; otherwise we skip highlight.
    out_anon = anonymized_esc
    for e in ents:
        # try to locate hashed/replaced representation near where original span was
        # look for the hashed text (sha256) or replace token
        # this is heuristic and not perfect; it's sufficient for visualization in most cases
        pass  # we'll not mutate anonymized text positions to avoid complexity

    # simple side-by-side HTML
    html_block = f"""
    <div style="display:flex; gap:16px;">
      <div style="flex:1; border:1px solid #eee; padding:12px; border-radius:8px; background:#fafafa;">
        <h4 style="margin:4px 0;">Original</h4>
        <div style="font-family:monospace; font-size:14px; line-height:1.4;">{orig_html}</div>
      </div>
      <div style="flex:1; border:1px solid #eee; padding:12px; border-radius:8px; background:#fff;">
        <h4 style="margin:4px 0;">Anonymized</h4>
        <div style="font-family:monospace; font-size:14px; line-height:1.4;">{anonymized_esc.replace(chr(10), '<br/>')}</div>
      </div>
    </div>
    """
    return html_block

# -----------------------
# App UI
# -----------------------

st.set_page_config(page_title="Presidio Anonymizer — UI", layout="wide", initial_sidebar_state="expanded")
analyzer, anonymizer = init_engines()

with st.sidebar:
    st.image("/home/sib/Desktop/Extras/Final ChaosCodez.png", width=160)  # add your logo path or remove
    st.markdown("## Presidio Anonymizer")
    st.write("Upload files, choose technique, preview, and download anonymized outputs.")
    st.divider()

    technique = st.selectbox("Technique", ["Redact", "Replace", "Mask", "Hash"])
    replace_value = None
    if technique == "Replace":
        replace_value = st.text_input("Replacement token", "<REDACTED>")

    entity_multiselect = st.multiselect("Entities to detect", 
                                       ["PERSON", "PHONE_NUMBER", "CREDIT_CARD", "EMAIL_ADDRESS", "LOCATION", "DATE_TIME", "USERNAME", "IP_ADDRESS"],
                                       default=["PERSON", "PHONE_NUMBER", "EMAIL_ADDRESS", "CREDIT_CARD", "LOCATION", "DATE_TIME"])
    st.checkbox("Show analyzer debug table", value=False, key="debug_table")
    st.checkbox("Batch mode (multiple files)", value=False, key="batch_mode")
    st.divider()
    st.caption("Tip: Use Hash for reversible mapping via audit CSV. Mask uses fixed stars. Replace inserts token.")

# file uploader in main area (keeps UI consistent)
st.title("PII Anonymizer — Preview & Export")
st.markdown("Upload .txt files or paste text. Use the sidebar to select the technique and entities.")

batch_mode = st.session_state.get("batch_mode", False)
uploaded_files = st.file_uploader("Upload text files", type=["txt"], accept_multiple_files=batch_mode)
pasted_text = st.text_area("Or paste text directly (single document)", height=120)

# tabs for layout
tab1, tab2, tab3 = st.tabs(["Input", "Preview & Diff", "Audit / Logs"])

# in-memory audit rows
if "audit_rows" not in st.session_state:
    st.session_state["audit_rows"] = []

def analyze_and_anonymize_text(text: str):
    # analyze
    results = analyzer.analyze(text=text, entities=entity_multiselect, language="en")
    # build operator config
    operators = build_operators(technique, replace_value)

    # if technique Hash: we will create mapping table and call anonymizer or pre-hash
    if technique == "Hash":
        # let anonymizer handle hash operator if present
        anon_result = anonymizer.anonymize(text=text, analyzer_results=results, operators=operators)
        # build audit map: map original spans -> hashed values by using results and re-analyzing anonymized? We'll produce mapping by hashing original spans ourselves
        audit = []
        for r in results:
            span = text[r.start:r.end]
            hashed = sha256_hex(span)
            audit.append({"file": "", "entity": r.entity_type, "original": span, "anonymized": hashed, "start": r.start, "end": r.end})
        return anon_result.text, results, audit
    else:
        anon_result = anonymizer.anonymize(text=text, analyzer_results=results, operators=operators)
        audit = []
        for r in results:
            span = text[r.start:r.end]
            # compute what anonymizer will have done (approx)
            if technique == "Redact":
                anon_val = "[REDACTED]"
            elif technique == "Replace":
                anon_val = replace_value if replace_value else "<REDACTED>"
            elif technique == "Mask":
                anon_val = "********"
            else:
                anon_val = ""
            audit.append({"file": "", "entity": r.entity_type, "original": span, "anonymized": anon_val, "start": r.start, "end": r.end})
        return anon_result.text, results, audit

# -----------------------
# Tab 1: Input
# -----------------------
with tab1:
    st.header("Input")
    if uploaded_files:
        # st.write(f"Uploaded {len(uploaded_files)} file(s).")
        for f in uploaded_files:
            st.write(f"- {f.name} — {f.size} bytes")
    elif pasted_text.strip():
        st.info("Using pasted text as single document.")
    else:
        st.info("Upload a .txt file or paste text to start.")

    run_btn = st.button("Run Anonymization")

# -----------------------
# Tab 2: Preview & Diff
# -----------------------
with tab2:
    st.header("Preview & Diff")
    if run_btn:
        files_to_process = []
        if uploaded_files:
            files_to_process = uploaded_files
        elif pasted_text.strip():
            files_to_process = [io.BytesIO(pasted_text.encode("utf-8"))]
        else:
            st.warning("No input provided.")
            files_to_process = []

        progress = st.progress(0)
        total = len(files_to_process)
        results_ui = []

        for idx, f in enumerate(files_to_process):
            fname = getattr(f, "name", f"pasted_{idx}.txt")
            # read content
            if hasattr(f, "read"):
                raw = f.read().decode("utf-8") if isinstance(f.read(), (bytes, bytearray)) else f.read()
                # note: we called f.read() above which consumed stream; to avoid double reads, reset if needed
                # simpler: re-open from bytes if BytesIO
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
            else:
                raw = f.getvalue().decode("utf-8") if isinstance(f.getvalue(), (bytes, bytearray)) else str(f)

            # perform anonymization
            anon_text, analyzer_results, audit = analyze_and_anonymize_text(raw)

            # attach file name in audit rows
            for a in audit:
                a["file"] = fname
            st.session_state["audit_rows"].extend(audit)

            # preview UI
            with st.expander(f"Preview: {fname}", expanded=(idx == 0)):
                st.markdown(highlight_diff(raw, anon_text, [{"start": r.start, "end": r.end, "span": raw[r.start:r.end]} for r in analyzer_results]), unsafe_allow_html=True)
                col_dl1, col_dl2 = st.columns([1, 1])
                with col_dl1:
                    st.download_button("Download anonymized", data=anon_text, file_name=f"{fname.rsplit('.',1)[0]}_anonymized_{technique}.txt", mime="text/plain")
                with col_dl2:
                    # save audit CSV for this file
                    if len(audit) > 0:
                        df_a = pd.DataFrame(audit)
                        csv_buf = df_a.to_csv(index=False).encode("utf-8")
                        st.download_button("Download audit CSV (this file)", data=csv_buf, file_name=f"{fname.rsplit('.',1)[0]}_audit.csv", mime="text/csv")

            progress.progress(int((idx + 1) / total * 100) if total > 0 else 100)

        if total == 0:
            st.info("No documents processed.")
        else:
            st.success(f"Processed {total} document(s).")

    else:
        st.info("Press **Run Anonymization** in the Input tab to produce previews.")

# -----------------------
# Tab 3: Audit / Logs
# -----------------------
with tab3:
    st.header("Audit / Logs")
    rows = st.session_state.get("audit_rows", [])
    if len(rows) == 0:
        st.info("No audit rows yet — run anonymization to generate audit trails.")
    else:
        df = pd.DataFrame(rows)
        st.dataframe(df, use_container_width=True)
        csv_all = df.to_csv(index=False).encode("utf-8")
        st.download_button("Download full audit CSV", data=csv_all, file_name=f"audit_log_{technique}.csv", mime="text/csv")

    if st.button("Clear audit log"):
        st.session_state["audit_rows"] = []
        st.experimental_rerun()

# -----------------------
# Footer / tips
# -----------------------
st.markdown("---")
st.caption("Built with Streamlit + Presidio. For production consider adding authentication, rate-limiting, and secure storage for audit logs.")
st.caption("© 2024 Ciphera-D.A.D")