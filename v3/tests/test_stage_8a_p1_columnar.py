"""
Unit Tests for Stage 8A P1: Table-Column Context Propagation
Tests robust header parsing, column boundary isolation, candidate validation,
and adversarial non-PII column protection.
"""

import os
import sys
import pytest
import fitz

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from app.schemas.document import CanonicalDocument, CanonicalBlock, BoundingBox, RedactionEntity
from app.services.columnar_inference import ColumnarInferenceEngine


class TestStage8AP1Columnar:

    def test_p1_01_standard_table_multi_column_propagation(self):
        """Validates that a multi-column table propagates Aadhaar, PAN, and Bank Account correctly."""
        table_text = (
            "Emp ID | Employee Name | Aadhaar Number | PAN Number | Salary Account\n"
            "EMP01 | Rahul Sharma | 9876 5432 1098 | ABCPV1234A | 987654321012\n"
            "EMP02 | Sneha Patel | 8765 4321 0987 | ABCSP5678B | 112233445566\n"
        )
        inferred = ColumnarInferenceEngine.infer_text_tables(table_text)
        types = [inf["entity_type"] for inf in inferred]
        texts = [inf["text"] for inf in inferred]

        # Verify all expected PII entities were inferred
        assert "AADHAAR_NUMBER" in types
        assert "PAN_NUMBER" in types
        assert "BANK_ACCOUNT" in types
        assert "PERSON" in types
        assert "9876 5432 1098" in texts
        assert "ABCPV1234A" in texts
        assert "987654321012" in texts
        assert "Rahul Sharma" in texts

    def test_p1_02_adjacent_non_pii_columns_strictly_isolated(self):
        """Verifies that non-PII columns (Emp ID, Net Salary, Qty, Rate, Debit) are never classified as PII."""
        table_text = (
            "Emp ID | Designation | Net Salary | Debit | Credit\n"
            "EMP01 | Lead Engineer | 95000 | 12000.00 | 85000.00\n"
            "EMP02 | Architect | 110000 | 25000.00 | 95000.00\n"
        )
        inferred = ColumnarInferenceEngine.infer_text_tables(table_text)
        # ZERO entities should be inferred from non-PII columns
        assert len(inferred) == 0

    def test_p1_03_invalid_cell_structure_rejected(self):
        """Verifies that invalid or non-matching cell values in a PII column are not inferred."""
        table_text = (
            "Aadhaar Number | PAN Number\n"
            "NOT_AN_AADHAAR | INVALID_PAN_CODE\n"
            "123 | ABC123\n"
        )
        inferred = ColumnarInferenceEngine.infer_text_tables(table_text)
        # Neither invalid string matches Aadhaar or PAN structure
        assert len(inferred) == 0

    def test_p1_04_missing_header_no_inference(self):
        """Verifies that an unheadered list of numbers is not blindly classified without verified header."""
        table_text = (
            "100293847561 | 95000\n"
            "998877665544 | 110000\n"
        )
        inferred = ColumnarInferenceEngine.infer_text_tables(table_text)
        assert len(inferred) == 0

    def test_p1_05_blank_line_breaks_table_context(self):
        """Verifies that an empty line terminates table context so unrelated subsequent lines are unaffected."""
        table_text = (
            "PAN Number | Salary Account\n"
            "ABCPV1234A | 987654321012\n"
            "\n"
            "Order SKU Reference: 112233445566\n"
        )
        inferred = ColumnarInferenceEngine.infer_text_tables(table_text)
        # The line after blank line must NOT inherit table context
        texts = [inf["text"] for inf in inferred]
        assert "ABCPV1234A" in texts
        assert "987654321012" in texts
        assert "112233445566" not in texts

    def test_p1_06_spatial_header_column_alignment(self):
        """Verifies that spatial layout blocks strictly below a header are inferred."""
        doc = CanonicalDocument(
            metadata={"filename": "test.pdf", "type": "pdf", "page_count": 1},
            blocks=[
                # Header row
                CanonicalBlock(page_num=1, text="PAN Number\n", bbox=BoundingBox(x0=50, y0=50, x1=150, y1=70), start_index=0, end_index=11),
                CanonicalBlock(page_num=1, text="Net Salary\n", bbox=BoundingBox(x0=200, y0=50, x1=300, y1=70), start_index=12, end_index=23),
                # Row 1
                CanonicalBlock(page_num=1, text="ABCPV1234A\n", bbox=BoundingBox(x0=52, y0=80, x1=148, y1=100), start_index=24, end_index=35),
                CanonicalBlock(page_num=1, text="95000\n", bbox=BoundingBox(x0=200, y0=80, x1=300, y1=100), start_index=36, end_index=42),
            ],
            full_text="PAN Number | Net Salary\nABCPV1234A | 95000\n",
            page_count=1
        )
        entities = ColumnarInferenceEngine.run_inference(doc, [])
        types = [e.entity_type for e in entities]
        texts = [e.text for e in entities]
        assert "PAN_NUMBER" in types
        assert "ABCPV1234A" in texts
        # 95000 in Net Salary must NEVER be inferred
        assert "95000" not in texts

    def test_p1_07_page_boundary_isolation(self):
        """Verifies that headers on Page 1 do not propagate down to Page 2 blocks."""
        doc = CanonicalDocument(
            metadata={"filename": "multipage.pdf", "type": "pdf", "page_count": 2},
            blocks=[
                # Page 1 Header
                CanonicalBlock(page_num=1, text="Salary Account\n", bbox=BoundingBox(x0=50, y0=50, x1=150, y1=70), start_index=0, end_index=15),
                # Page 2 Block at same X coordinates
                CanonicalBlock(page_num=2, text="987654321012\n", bbox=BoundingBox(x0=50, y0=80, x1=150, y1=100), start_index=16, end_index=29),
            ],
            full_text="Salary Account\n--- PAGE 2 ---\n987654321012\n",
            page_count=2
        )
        entities = ColumnarInferenceEngine.run_inference(doc, [])
        # Page 2 block must NOT receive Page 1 header context
        page2_entities = [e for e in entities if e.page_num == 2]
        assert len(page2_entities) == 0

    def test_p1_08_ambiguous_wide_block_rejected(self):
        """Verifies that a wide block spanning across multiple columns (e.g. table footnote or merged cell) is rejected."""
        doc = CanonicalDocument(
            metadata={"filename": "merged.pdf", "type": "pdf", "page_count": 1},
            blocks=[
                CanonicalBlock(page_num=1, text="PAN Number\n", bbox=BoundingBox(x0=50, y0=50, x1=120, y1=70), start_index=0, end_index=11),
                # Footnote spanning 400pt wide
                CanonicalBlock(page_num=1, text="Note: ABCDE1234F is registered\n", bbox=BoundingBox(x0=50, y0=150, x1=450, y1=170), start_index=12, end_index=43),
            ],
            full_text="PAN Number\nNote: ABCDE1234F is registered\n",
            page_count=1
        )
        entities = ColumnarInferenceEngine.run_inference(doc, [])
        # The wide footnote block must not be inferred as a clean column cell
        assert not any(e.text == "Note: ABCDE1234F is registered" for e in entities)
