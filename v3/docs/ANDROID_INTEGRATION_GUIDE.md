# Ciphera Android Client Integration Guide (Common Backend)

This guide provides everything needed for the Android client development team (and automated AI coding agents) to integrate with the Ciphera common backend.

---

## 1. OpenAPI Specification Contract
The complete, authoritative OpenAPI 3.1 schema is exported and committed at:
- **[`docs/openapi.json`](file:///docs/openapi.json)** (contains all 59 backend endpoints, models, query parameters, and error schemas).

You can import this JSON directly into Postman, Insomnia, or use OpenAPI Generator / Retrofit / Ktor code generators:
```bash
# Example Retrofit / Kotlin generator
openapi-generator-cli generate -i docs/openapi.json -g kotlin -o android_client/
```

---

## 2. Network Configuration & Base URLs

| Environment | Base URL | Notes |
| :--- | :--- | :--- |
| **Android Emulator** | `http://10.0.2.2:8000` | `10.0.2.2` is the special Android emulator loopback alias to the host machine's `localhost`. |
| **Physical Android Device (LAN)** | `http://<HOST_LAN_IP>:8000` | Phone and host machine must be on the same Wi-Fi network (e.g. `http://192.168.1.50:8000`). |
| **Physical Device via USB (Recommended)** | `http://localhost:8000` | Run `adb reverse tcp:8000 tcp:8000`. This allows the phone to directly address `localhost:8000`! |
| **Production Cloud** | `https://api.ciphera.io` | When deployed to production reverse proxy. |

### Android `network_security_config.xml` (For Local HTTP Testing)
Because local development uses `http://` instead of `https://`, ensure your Android app allows cleartext traffic for local loopbacks:
```xml
<!-- res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="true">10.0.2.2</domain>
        <domain includeSubdomains="true">localhost</domain>
        <domain includeSubdomains="true">127.0.0.1</domain>
    </domain-config>
</network-security-config>
```
In `AndroidManifest.xml`:
```xml
<application
    android:networkSecurityConfig="@xml/network_security_config"
    ... >
```

---

## 3. Authentication & Headers

All protected endpoints require an `Authorization` header containing the JWT access token:
```http
Authorization: Bearer <access_token>
```

### Authentication Flow
1. **User Login:**
   - **Endpoint:** `POST /api/v1/auth/login`
   - **Content-Type:** `application/json`
   - **Payload:**
     ```json
     {
       "email": "agent@enterprise.com",
       "password": "SecurePassword123"
     }
     ```
   - **Response (200 OK):**
     ```json
     {
       "access_token": "eyJhbGciOi...",
       "token_type": "bearer",
       "user": {
         "id": "usr_981a",
         "email": "agent@enterprise.com",
         "full_name": "Compliance Officer",
         "org_id": "org_default"
       }
     }
     ```
2. Store `access_token` securely in Android `EncryptedSharedPreferences` or Android Keystore.
3. Attach `Authorization: Bearer <access_token>` to all subsequent requests.

---

## 4. Core Endpoints for Mobile Workflows

### Workflow A: Camera / File Document Upload & Asynchronous Redaction
Mobile field workers capture or select a PDF / image and submit it for irreversible redaction:

1. **Upload Document:**
   - **Endpoint:** `POST /api/v1/documents/upload`
   - **Content-Type:** `multipart/form-data`
   - **Form Fields:**
     - `file`: Binary file stream (PDF, PNG, JPG).
     - Limits: Max 25 MB file size; max 100 pages for PDFs (exceeding returns HTTP 413).
   - **Response (201 Created):**
     ```json
     {
       "id": "doc_8f1a23e4",
       "filename": "kyc_scan.pdf",
       "file_type": "application/pdf",
       "status": "PROCESSING",
       "job_id": "job_c7a91b"
     }
     ```

2. **Poll Processing Status:**
   - **Endpoint:** `GET /api/v1/documents/{job_id}/status`
   - **Response (200 OK):**
     ```json
     {
       "job_id": "job_c7a91b",
       "status": "PENDING_REVIEW",  // QUEUED, PROCESSING, PENDING_REVIEW, COMPLETED, FAILED
       "safety_status": "VERIFIED", // UNVERIFIED, VERIFIED, LEAK_DETECTED
       "has_artifact": true,
       "error_message": null
     }
     ```
   - *Android implementation note:* Poll every 1.5 to 2.0 seconds until status is `COMPLETED`, `PENDING_REVIEW`, or `FAILED`.

3. **Download Secure Redacted PDF:**
   - **Endpoint:** `GET /api/v1/documents/{job_id}/download`
   - **Response (200 OK):** Binary PDF stream (`application/pdf`) with `Content-Disposition: attachment; filename="redacted_kyc_scan.pdf"`.
   - *Security Guard:* If the Independent Verifier flags an unredacted leak, download returns HTTP 403 Forbidden (`Verification failed: privacy breach risk`).

---

### Workflow B: Mobile Maker / Checker Compliance Review
For supervisor tablets or mobile compliance officers:

1. **List Documents Awaiting Clearance:**
   - **Endpoint:** `GET /api/v1/documents/pending-review`
   - **Response (200 OK):** List of document objects requiring sign-off.

2. **Submit Checker Review Decision:**
   - **Endpoint:** `POST /api/v1/documents/{job_id}/review`
   - **Content-Type:** `application/json`
   - **Payload:**
     ```json
     {
       "decision": "APPROVED", // "APPROVED" or "REJECTED"
       "reviewer_notes": "All Aadhaar and PAN numbers verified scrubbed from ledger.",
       "modifications": []     // Optional bounding-box corrections
     }
     ```
   - **Response (200 OK):**
     ```json
     {
       "status": "COMPLETED",
       "safety_status": "VERIFIED"
     }
     ```

---

### Workflow C: Real-Time Field Text Redaction / Inspection
For instant offline/online text redaction (e.g. pasted SMS, OCR text notes, or form fields):

- **Endpoint:** `POST /api/v3/analyze`
- **Content-Type:** `application/json`
- **Payload:**
  ```json
  {
    "text": "Customer Aadhaar is 4532 8812 9901 and PAN is ABCDE1234F.",
    "threshold": 0.5,
    "include_context": true
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "entity_count": 2,
    "entities": [
      {
        "entity_type": "AADHAAR_NUMBER",
        "text": "4532 8812 9901",
        "start": 20,
        "end": 34,
        "score": 0.98,
        "source": "STRUCTURED_VALIDATOR"
      },
      {
        "entity_type": "PAN_NUMBER",
        "text": "ABCDE1234F",
        "start": 46,
        "end": 56,
        "score": 0.95,
        "source": "STRUCTURED_VALIDATOR"
      }
    ]
  }
  ```

---

## 5. Standard HTTP Status Codes

| Code | Reason | Meaning for Android App |
| :--- | :--- | :--- |
| `200 OK` | Success | Normal operation. |
| `201 Created` | Upload Accepted | Document queued for processing. |
| `401 Unauthorized` | Invalid/Expired Token | Redirect user to Login screen. |
| `403 Forbidden` | Access Denied / Verification Failed | Cross-tenant attempt or blocked download of quarantined leak file. |
| `404 Not Found` | Resource Missing | Invalid job ID or document ID. |
| `413 Payload Too Large` | Resource Limit Exceeded | File exceeds 25 MB or PDF exceeds 100 pages. Display user alert. |
| `422 Unprocessable` | Validation Error | Malformed JSON or unsupported MIME type. |
| `500 Server Error` | Pipeline Failure | Background worker issue. Display retry prompt. |

---

## 6. Verification and Health Check
To verify backend connectivity from the Android device before authenticating:
- **Endpoint:** `GET /api/v3/health`
- **Expected Response (200 OK):**
  ```json
  {
    "status": "ok",
    "version": "3.4.0",
    "features": {
      "auth": true,
      "rbac": true,
      "english_pipeline": true
    }
  }
  ```
