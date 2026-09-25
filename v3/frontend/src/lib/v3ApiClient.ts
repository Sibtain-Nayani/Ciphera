import { api, apiFetch } from './api';

export interface BoundingBox {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface RedactionEntity {
    id: string;
    entity_type: string;
    text: string;
    score: number;
    page_num: number;
    bbox?: BoundingBox;
    start_index?: number;
    end_index?: number;
    status: string; // pending, accepted, rejected, modified
}

export interface UploadResponse {
    message: string;
    document_id: string;
    metadata: any;
    page_count: number;
}

export interface JobStatusResponse {
    job_id: string;
    status: string; // QUEUED, PROCESSING, COMPLETED, FAILED
    error_message: string | null;
}

export class V3ApiClient {
    /**
     * Upload a document for backend canonicalization and ml detection.
     */
    static async uploadDocument(file: File, orgId: string = "default-org"): Promise<UploadResponse> {
        const formData = new FormData();
        formData.append('file', file);
        
        // Use native fetch instead of apiFetch to avoid overriding Content-Type 
        // to application/json, since FormData needs multipart/form-data.
        const { getAccessToken, refreshTokens } = await import('@/lib/auth');
        let token = getAccessToken();
        let headers: Record<string, string> = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };

        const url = api(`/api/v3/documents/upload?org_id=${orgId}`);
        let res = await fetch(url, { method: 'POST', body: formData, headers });
        
        if (res.status === 401) {
            const ok = await refreshTokens();
            if (ok) {
                token = getAccessToken();
                headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
                res = await fetch(url, { method: 'POST', body: formData, headers });
            }
        }

        if (!res.ok) {
            throw new Error(`Upload failed: ${res.statusText}`);
        }
        return res.json();
    }

    /**
     * Get backend canonical representation.
     */
    static async getCanonical(documentId: string): Promise<any> {
        const res = await apiFetch(`/api/v3/documents/${documentId}/canonical`);
        if (!res.ok) throw new Error("Failed to fetch canonical doc");
        return res.json();
    }

    /**
     * Get backend detected entities.
     */
    static async getEntities(documentId: string): Promise<RedactionEntity[]> {
        const res = await apiFetch(`/api/v3/documents/${documentId}/entities`);
        if (!res.ok) throw new Error("Failed to fetch entities");
        const data = await res.json();
        return data.entities || [];
    }

    /**
     * Save human-modified entities back to backend.
     */
    static async updateEntities(documentId: string, entities: RedactionEntity[]): Promise<any> {
        const res = await apiFetch(`/api/v3/documents/${documentId}/entities`, {
            method: 'PUT',
            body: JSON.stringify(entities)
        });
        if (!res.ok) throw new Error("Failed to update entities");
        return res.json();
    }

    /**
     * Dispatch an async redaction job.
     */
    static async redactAsync(documentId: string): Promise<{ job_id: string }> {
        const res = await apiFetch(`/api/v3/documents/${documentId}/redact/async`, {
            method: 'POST'
        });
        if (!res.ok) throw new Error("Failed to trigger redaction");
        return res.json();
    }

    /**
     * Poll job status.
     */
    static async getJobStatus(jobId: string): Promise<JobStatusResponse> {
        const res = await apiFetch(`/api/v3/documents/redact/jobs/${jobId}`);
        if (!res.ok) throw new Error("Failed to check job status");
        return res.json();
    }

    /**
     * Download redacted file.
     */
    static async downloadRedacted(jobId: string, fileName: string): Promise<void> {
        const { getAccessToken, refreshTokens } = await import('@/lib/auth');
        let token = getAccessToken();
        let headers: Record<string, string> = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        
        const url = api(`/api/v3/documents/redact/jobs/${jobId}/download`);
        let res = await fetch(url, { headers });
        if (res.status === 401) {
            const ok = await refreshTokens();
            if (ok) {
                token = getAccessToken();
                headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
                res = await fetch(url, { headers });
            }
        }
        if (!res.ok) throw new Error("Failed to download redacted file");
        
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = `redacted_${fileName}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
    }

    /**
     * Helper to map backend entities to the frontend Token stream for the text view.
     */
    static convertEntitiesToTokens(rawText: string, entities: RedactionEntity[]): any[] {
        if (!rawText) return [];
        // Sort entities by start_index
        const sorted = [...entities].filter(e => e.start_index !== undefined && e.end_index !== undefined)
                                    .sort((a, b) => (a.start_index!) - (b.start_index!));
        
        const tokens: any[] = [];
        let cursor = 0;
        
        for (const ent of sorted) {
            const start = ent.start_index!;
            const end = ent.end_index!;
            if (start > cursor) {
                tokens.push({
                    id: `text_${cursor}`,
                    type: 'text',
                    value: rawText.substring(cursor, start)
                });
            }
            // Skip overlaps to keep it simple, or take the first match
            if (start >= cursor) {
                tokens.push({
                    id: ent.id,
                    type: ent.entity_type.toLowerCase(),
                    value: rawText.substring(start, end),
                    score: ent.score
                });
                cursor = end;
            }
        }
        if (cursor < rawText.length) {
            tokens.push({
                id: `text_${cursor}`,
                type: 'text',
                value: rawText.substring(cursor)
            });
        }
        return tokens;
    }
}

