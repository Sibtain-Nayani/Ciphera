import os
import io
import fitz
import time
from fastapi.testclient import TestClient

from main import app
from app.core.database import SessionLocal
from app.models.identity import Organization, User

client = TestClient(app)

def create_synthetic_pdf() -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    text = """
    CONFIDENTIAL PATIENT RECORD
    
    Name: John Smith
    Phone: 9876543210
    Email: john@example.com
    Patient ID: P123456
    
    Medical Notes:
    Patient was seen on 2023-10-15 for a routine checkup.
    """
    page.insert_text((50, 50), text, fontsize=12)
    return doc.write()

def main():
    print("--- 🧪 ACID TEST: ZERO-TRUST VERIFICATION ---")
    
    db = SessionLocal()
    org_id = "test-org"
    user_id = "test-user-3"
    if not db.query(Organization).filter_by(id=org_id).first():
        db.add(Organization(id=org_id, name="Test Org", created_by=user_id))
    
    from app.api.auth import hash_password
    if not db.query(User).filter_by(id=user_id).first():
        db.add(User(
            id=user_id, 
            email="test3@ciphera.in", 
            full_name="Test User", 
            password_hash=hash_password("password")
        ))
    db.commit()
    
    res = client.post("/api/v3/auth/login", json={"email": "test3@ciphera.in", "password": "password"})
    if res.status_code != 200:
        print("Auth failed:", res.json())
        return
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    pdf_bytes = create_synthetic_pdf()
    
    print("\n[1] Uploading document to /api/v3/documents/upload")
    res = client.post(
        f"/api/v3/documents/upload?org_id={org_id}",
        files={"file": ("patient_record.pdf", pdf_bytes, "application/pdf")},
        headers=headers
    )
    if res.status_code != 200:
        print("Upload failed:", res.json())
        return
        
    doc_id = res.json()["document_id"]
    print(f"✅ Uploaded. Document ID: {doc_id}")
    
    print("\n[2] Fetching Detected Entities")
    res = client.get(f"/api/v3/documents/{doc_id}/entities", headers=headers)
    entities = res.json()["entities"]
    
    print(f"✅ Found {len(entities)} entities.")
    for e in entities:
        print(f"  - {e['entity_type']}: {e['text']} (Confidence: {e['score']})")
        
    print("\n[3] Simulating Human Review (Adding custom bounding box for 'John Smith')")
    custom_entity = {
        "id": "manual-1",
        "entity_type": "PERSON",
        "text": "John Smith",
        "score": 1.0,
        "page_num": 1,
        "bbox": {"x0": 90, "y0": 92, "x1": 180, "y1": 105},
        "status": "accepted"
    }
    entities.append(custom_entity)
    client.put(f"/api/v3/documents/{doc_id}/entities", json=entities, headers=headers)
    print("✅ Human modifications saved.")
    
    print("\n[4] Triggering Redaction")
    res = client.post(f"/api/v3/documents/{doc_id}/redact", headers=headers)
    if res.status_code != 200:
        print("❌ Redaction failed:", res.json())
        return
        
    redacted_bytes = res.content
    print(f"✅ Redaction complete. Received {len(redacted_bytes)} bytes.")
    
    print("\n[5] Acid Test - Attempting to extract text from redacted PDF...")
    doc = fitz.open(stream=redacted_bytes, filetype="pdf")
    page = doc[0]
    extracted_text = page.get_text()
    
    print("--- Extracted Text ---")
    print(extracted_text)
    print("----------------------")
    
    sensitive_data = ["John Smith", "9876543210", "john@example.com", "P123456"]
    leaks = 0
    for target in sensitive_data:
        if target.lower() in extracted_text.lower():
            print(f"❌ LEAK DETECTED: '{target}' survived redaction!")
            leaks += 1
        else:
            print(f"✅ SUCCESS: '{target}' was successfully destroyed.")
            
    if leaks == 0:
        print("\n🎉 ACID TEST PASSED: Zero-Trust Verification confirmed true destruction.")
    else:
        print("\n⚠️ ACID TEST FAILED: Sensitive data leaked.")
        
if __name__ == "__main__":
    main()
