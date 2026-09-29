import json

def generate_markdown_report(global_metrics, class_metrics, document_results, output_path):
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write("# Adversarial Benchmark Report (v1 Baseline)\n\n")
        f.write("## Global Metrics\n")
        f.write(f"- **Precision:** {global_metrics['precision']:.4f}\n")
        f.write(f"- **Recall:**    {global_metrics['recall']:.4f}\n")
        f.write(f"- **F1 Score:**  {global_metrics['f1']:.4f}\n")
        f.write(f"- *(Duplicates: {global_metrics['dups']})*\n\n")
        
        f.write("## Per-Class Metrics\n")
        f.write("| Entity Type | Precision | Recall | F1 Score | TP | FP | FN | Dups |\n")
        f.write("|-------------|-----------|--------|----------|----|----|----|------|\n")
        
        for cls, m in sorted(class_metrics.items()):
            f.write(f"| {cls} | {m['precision']:.2f} | {m['recall']:.2f} | {m['f1']:.2f} | {m['tp']} | {m['fp']} | {m['fn']} | {m['dups']} |\n")
            
        f.write("\n## Document Breakdown\n")
        for doc_res in document_results:
            f.write(f"### {doc_res['id']}\n")
            metrics = doc_res['metrics']
            f.write(f"- **True Positives:** {metrics['tp']}\n")
            f.write(f"- **False Positives:** {metrics['fp']}\n")
            f.write(f"- **False Negatives:** {metrics['fn']}\n")
            
            leaks = [e for e in doc_res['expected'] if e['matched_by'] is None]
            if leaks:
                f.write("\n**🚨 FALSE NEGATIVES (LEAKS):**\n")
                for l in leaks:
                    f.write(f"- `{l['type']}`: \"{l['value']}\"\n")
            
            over_redacted = [d for d in doc_res['detected'] if d['matched_to'] is None]
            if over_redacted:
                f.write("\n**⚠️ FALSE POSITIVES (OVER-REDACTION):**\n")
                for fp in over_redacted:
                    tag = " (DUPLICATE)" if fp['duplicate_of'] is not None else ""
                    # truncate value for display if too long
                    val = fp['value'].replace('\\n', ' ')
                    if len(val) > 40: val = val[:40] + "..."
                    f.write(f"- `{fp['type']}`: \"{val}\"{tag}\n")
            f.write("\n---\n")

def save_baseline(global_metrics, class_metrics, output_path):
    baseline = {
        "global": global_metrics,
        "classes": class_metrics
    }
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(baseline, f, indent=2)
