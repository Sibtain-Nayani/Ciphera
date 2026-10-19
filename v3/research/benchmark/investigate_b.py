import json

s6 = json.load(open('research/reports/held_out_stage6/STAGE_6_BENCHMARK_RESULTS.json', 'r', encoding='utf-8'))
s9 = json.load(open('research/reports/held_out_stage9/STAGE_9_BENCHMARK_RESULTS.json', 'r', encoding='utf-8'))

print("=== INVESTIGATION 1: Stage 6 Core-Target Macro F1 Discrepancy ===")
# What is in s6['overall']['macro']?
print("s6 macro in JSON:", json.dumps(s6['overall']['macro'], indent=2))

# What are the 9 core classes?
core_classes = [
    "AADHAAR_NUMBER", "BANK_ACCOUNT", "DATE_OF_BIRTH", "EMAIL_ADDRESS",
    "IFSC_CODE", "PAN_NUMBER", "PASSPORT_NUMBER", "PHONE_NUMBER", "VOTER_ID"
]

print("\nPer-class metrics in Stage 6 for core classes:")
f1_list_core = []
p_list_core = []
r_list_core = []
for c in core_classes:
    data = s6['overall']['per_class'].get(c, {})
    p = data.get('precision') or 0.0
    r = data.get('recall') or 0.0
    f1 = data.get('f1') or 0.0
    p_list_core.append(p)
    r_list_core.append(r)
    f1_list_core.append(f1)
    print(f"  {c:18}: P={p*100:.2f}%, R={r*100:.2f}%, F1={f1*100:.2f}% (TP={data.get('tp')}, FN={data.get('fn')}, FP={data.get('fp')})")

macro_f1_9 = sum(f1_list_core) / 9.0
macro_p_9 = sum(p_list_core) / 9.0
macro_r_9 = sum(r_list_core) / 9.0

# What if PASSPORT_NUMBER (which has R=0, P=0, F1=0 or undefined) is excluded? (8 classes)
f1_list_8 = [f for c, f in zip(core_classes, f1_list_core) if c != "PASSPORT_NUMBER"]
p_list_8 = [p for c, p in zip(core_classes, p_list_core) if c != "PASSPORT_NUMBER"]
r_list_8 = [r for c, r in zip(core_classes, r_list_core) if c != "PASSPORT_NUMBER"]
macro_f1_8 = sum(f1_list_8) / 8.0

# What if macro F1 is harmonic mean of macro P and macro R?
harmonic_macro_f1 = (2 * macro_p_9 * macro_r_9) / (macro_p_9 + macro_r_9) if (macro_p_9 + macro_r_9) > 0 else 0.0

print(f"\nArithmetic mean of 9 core classes F1: {macro_f1_9*100:.2f}%")
print(f"Arithmetic mean of 8 non-zero core classes F1 (excluding PASSPORT_NUMBER): {macro_f1_8*100:.2f}%")
print(f"Harmonic mean of Macro P ({macro_p_9*100:.2f}%) and Macro R ({macro_r_9*100:.2f}%): {harmonic_macro_f1*100:.2f}%")

# Let's search how 56.40% could have been formed
# What classes were present in s6?
print("\nAll classes in s6 per_class:")
for k, v in s6['overall']['per_class'].items():
    p = v.get('precision') or 0.0
    r = v.get('recall') or 0.0
    f1 = v.get('f1') or 0.0
    print(f"  {k:25}: P={p*100:.2f}%, R={r*100:.2f}%, F1={f1*100:.2f}%")

print("\n=== INVESTIGATION 2: Dense-Table Recall (37/52) ===")
# Dense table metrics in s6:
dt_s6 = s6.get('category_metrics', {}).get('dense_table', {}).get('micro', {})
tp_dt = dt_s6.get('tp', 0)
fn_dt = dt_s6.get('fn', 0)
rec_dt = dt_s6.get('recall', 0.0)
print(f"Stage 6 Dense Table: TP={tp_dt}, FN={fn_dt}, Total={tp_dt+fn_dt}")
print(f"Exact arithmetic 37/52 = {37/52:.6f} ({37/52*100:.4f}%)")
print(f"Reported in s6 JSON: recall={rec_dt} ({rec_dt*100:.4f}%)")

print("\n=== INVESTIGATION 3: Stage 6 Verifier Halt Metric ===")
p6_priv = s6['overall']['privacy_leakage']
print("Stage 6 privacy_leakage fields:", json.dumps(p6_priv, indent=2))
c6_clean = s6['overall']['clean_documents']
print("Stage 6 clean_documents fields:", json.dumps(c6_clean, indent=2))

print("\n=== INVESTIGATION 4: False Positive Tracing (+13 vs -118 = -105) ===")
# Trace FP change across each class between s6 and s9
all_keys = set(s6['overall']['per_class'].keys()) | set(s9['overall']['per_class'].keys())
fp_changes = []
total_s6_fp = s6['overall']['micro']['fp']
total_s9_fp = s9['overall']['micro']['fp']

for k in sorted(all_keys):
    fp6 = s6['overall']['per_class'].get(k, {}).get('fp', 0)
    fp9 = s9['overall']['per_class'].get(k, {}).get('fp', 0)
    delta = fp9 - fp6
    if fp6 > 0 or fp9 > 0:
        fp_changes.append((k, fp6, fp9, delta))

print(f"Total Stage 6 FP: {total_s6_fp}")
print(f"Total Stage 9 FP: {total_s9_fp}")
print(f"Net change: {total_s9_fp - total_s6_fp}")

eliminated_inferred = 0
increases = []
decreases = []
unchanged = []

for k, fp6, fp9, delta in fp_changes:
    if delta > 0:
        increases.append((k, fp6, fp9, delta))
    elif delta < 0:
        decreases.append((k, fp6, fp9, delta))
    else:
        unchanged.append((k, fp6, fp9, delta))

print("\nClasses with FP Decreases (eliminations):")
for k, fp6, fp9, delta in decreases:
    print(f"  {k:25}: {fp6:3d} -> {fp9:3d} (delta: {delta:+4d})")

print("\nClasses with FP Increases:")
for k, fp6, fp9, delta in increases:
    print(f"  {k:25}: {fp6:3d} -> {fp9:3d} (delta: {delta:+4d})")

print("\nClasses with Unchanged FP:")
for k, fp6, fp9, delta in unchanged:
    print(f"  {k:25}: {fp6:3d} -> {fp9:3d} (delta: {delta:+4d})")


# Let's check what was reported in Stage 7A.1 or Stage 8:
# "The Stage 6 core-target macro F1 was previously reconciled to approximately 64.85% under the nine annotated classes, whereas this summary gives 56.40%."
# Let's check: 64.85% / 8 * 9 = 58.36%?
# What if PASSPORT was evaluated differently or how was 64.85% obtained?
# Let's check: 64.85% vs 56.40%:
# Notice: 56.40% is: sum(f1_list_core) / 9 = ? Let's check:
# sum of F1 for 9 core classes:
# AADHAAR: 0.5283
# BANK_ACCOUNT: 0.6800
# DATE_OF_BIRTH: 0.7368
# EMAIL_ADDRESS: 0.8000
# IFSC_CODE: 0.8136
# PAN_NUMBER: 0.7391
# PASSPORT: 0.0
# PHONE: 0.5385
# VOTER_ID: 1.0000
# Total sum = 0.5283018868 + 0.68 + 0.7368421053 + 0.8 + 0.813559322 + 0.7391304348 + 0.0 + 0.5384615385 + 1.0 = 5.8362952874
# If divided by 9: 5.836295 / 9 = 0.648477... => EXACTLY 64.85%!
