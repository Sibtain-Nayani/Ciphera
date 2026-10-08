import os
import sys
import json
import io
import fitz  # PyMuPDF
from PIL import Image
from typing import Dict, List, Any

sys.path.insert(0, '/app')
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas.document import RedactionEntity, BoundingBox
from app.services.verification_engine import VerificationEngine
from app.services.verification_geometry import GeometryVerifier
from app.services.verification_visual import VisualVerifier
from app.services.redaction_engine import SecureRedactionEngine


def run_checker_experiment() -> Dict[str, Any]:
    """
    Executes controlled adversarial failure injection into Maker output
    and measures Independent Checker catch rates across 5 defect classes.
    """
    experiments = {
        "class_1_missed_entity": {"injected": 0, "caught": 0, "by_layer": {"geometry": 0, "visual": 0, "regex": 0}},
        "class_2_undercovered_bbox": {"injected": 0, "caught": 0, "by_layer": {"geometry": 0, "visual": 0, "regex": 0}},
        "class_3_spatial_fragmentation": {"injected": 0, "caught": 0, "by_layer": {"geometry": 0, "visual": 0, "regex": 0}},
        "class_4_hidden_ocr_layer": {"injected": 0, "caught": 0, "by_layer": {"geometry": 0, "visual": 0, "regex": 0}},
        "class_5_clean_redaction_control": {"injected": 0, "false_alarms": 0},
    }

    # 1. Class 1: Maker Missed Entity (Maker completely misses PII)
    for pan in ["ABCDE1234F", "XYZPK9988Q", "BNMLA5432K"]:
        experiments["class_1_missed_entity"]["injected"] += 1
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text(fitz.Point(100, 100), f"Customer Permanent Account Number: {pan}", fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        # Maker passes 0 entities (missed!)
        maker_entities = []
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "missed.pdf", maker_entities)

        # Audit checker
        caught = False
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "missed.pdf", maker_entities)
        except Exception:
            caught = True

        if caught:
            experiments["class_1_missed_entity"]["caught"] += 1
            experiments["class_1_missed_entity"]["by_layer"]["regex"] += 1

    # 2. Class 2: Maker Under-covered Bounding Box (Bbox too small by 20pt horizontally)
    for aadhaar in ["4532 8812 9901", "9876 5432 1098", "1122 3344 5566"]:
        experiments["class_2_undercovered_bbox"]["injected"] += 1
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text(fitz.Point(100, 150), f"Aadhaar UID: {aadhaar}", fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        truncated_ent = RedactionEntity(
            id="defect_trunc",
            entity_type="AADHAAR_NUMBER",
            text=aadhaar,
            score=0.9,
            page_num=1,
            bbox=BoundingBox(x0=100, y0=135, x1=160, y1=155), # Truncated bbox
            start_index=0,
            end_index=len(aadhaar),
            status="pending"
        )
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "trunc.pdf", [truncated_ent])

        caught = False
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "trunc.pdf", [truncated_ent])
        except Exception:
            caught = True

        if caught:
            experiments["class_2_undercovered_bbox"]["caught"] += 1
            experiments["class_2_undercovered_bbox"]["by_layer"]["geometry"] += 1

    # 3. Class 3: Spatial Fragmentation Leak (Spaced digits left in text)
    for spaced_pan in ["A B C D E 1 2 3 4 F", "X Y Z P K 9 9 8 8 Q", "B N M L A 5 4 3 2 K"]:
        experiments["class_3_spatial_fragmentation"]["injected"] += 1
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text(fitz.Point(100, 200), f"PAN Card Ref: {spaced_pan}", fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "frag.pdf", [])

        caught = False
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "frag.pdf", [])
        except Exception:
            caught = True

        if caught:
            experiments["class_3_spatial_fragmentation"]["caught"] += 1
            experiments["class_3_spatial_fragmentation"]["by_layer"]["regex"] += 1

    # 4. Class 4: Hidden OCR Text Layer behind raster image
    for phone in ["9876543210", "9123456780", "8877665544"]:
        experiments["class_4_hidden_ocr_layer"]["injected"] += 1
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        img = Image.new("RGB", (250, 50), color=(255, 255, 255))
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='PNG')
        page.insert_image(fitz.Rect(50, 50, 300, 100), stream=img_bytes.getvalue())
        page.insert_text(fitz.Point(60, 80), f"Mobile Phone: {phone}", fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "hidden_ocr.pdf", [])

        caught = False
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "hidden_ocr.pdf", [])
        except Exception:
            caught = True

        if caught:
            experiments["class_4_hidden_ocr_layer"]["caught"] += 1
            experiments["class_4_hidden_ocr_layer"]["by_layer"]["regex"] += 1

    # 5. Class 5: Clean Redaction Control Group (Valid proper redaction should PASS)
    for valid_item in [
        ("ABCDE1234F", "Income Tax PAN: ABCDE1234F", "PAN_NUMBER"),
        ("4532 8812 9901", "Aadhaar: 4532 8812 9901", "AADHAAR_NUMBER"),
        ("9876543210", "Phone: 9876543210", "PHONE_NUMBER"),
    ]:
        experiments["class_5_clean_redaction_control"]["injected"] += 1
        doc = fitz.open()
        page = doc.new_page(width=612, height=792)
        page.insert_text(fitz.Point(100, 100), valid_item[1], fontsize=12)
        pdf_bytes = doc.tobytes()
        doc.close()

        clean_ent = RedactionEntity(
            id="valid_redact",
            entity_type=valid_item[2],
            text=valid_item[0],
            score=0.95,
            page_num=1,
            bbox=BoundingBox(x0=90, y0=85, x1=350, y1=115),
            start_index=0,
            end_index=len(valid_item[1]),
            status="pending"
        )
        redacted_bytes = SecureRedactionEngine.redact_document(pdf_bytes, "clean.pdf", [clean_ent])

        false_alarm = False
        try:
            VerificationEngine.verify_redacted_file(redacted_bytes, "clean.pdf", [clean_ent])
        except Exception:
            false_alarm = True

        if false_alarm:
            experiments["class_5_clean_redaction_control"]["false_alarms"] += 1

    total_injected_defects = (
        experiments["class_1_missed_entity"]["injected"]
        + experiments["class_2_undercovered_bbox"]["injected"]
        + experiments["class_3_spatial_fragmentation"]["injected"]
        + experiments["class_4_hidden_ocr_layer"]["injected"]
    )
    total_caught_defects = (
        experiments["class_1_missed_entity"]["caught"]
        + experiments["class_2_undercovered_bbox"]["caught"]
        + experiments["class_3_spatial_fragmentation"]["caught"]
        + experiments["class_4_hidden_ocr_layer"]["caught"]
    )

    catch_rate = (total_caught_defects / total_injected_defects) * 100.0 if total_injected_defects > 0 else 100.0
    control_total = experiments["class_5_clean_redaction_control"]["injected"]
    false_alarm_rate = (experiments["class_5_clean_redaction_control"]["false_alarms"] / control_total) * 100.0 if control_total > 0 else 0.0

    summary = {
        "experiments": experiments,
        "total_injected_defects": total_injected_defects,
        "total_caught_defects": total_caught_defects,
        "defect_catch_rate_pct": catch_rate,
        "control_clean_cases": control_total,
        "false_alarm_rate_pct": false_alarm_rate,
    }
    return summary


if __name__ == "__main__":
    rep_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "../reports"))
    os.makedirs(rep_dir, exist_ok=True)
    res = run_checker_experiment()
    with open(os.path.join(rep_dir, "r1_5_independent_checker.json"), "w") as f:
        json.dump(res, f, indent=2)
    print(f"R1.5 Completed: Defect Catch Rate {res['defect_catch_rate_pct']:.1f}%")
