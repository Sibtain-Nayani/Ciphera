/**
 * complianceReport.ts
 * ====================
 * Generates a compliance audit report from session audit logs.
 * Exports as PDF or CSV.
 *
 * Place at: v3/frontend/src/lib/complianceReport.ts
 */

import jsPDF from 'jspdf';
import { AuditLogEntry } from '@/store/sessionStore';

// ── CSV Export ───────────────────────────────────────────────────────────────

export function exportAuditCSV(logs: AuditLogEntry[], orgName = 'Ciphera'): void {
    const headers = ['Run ID', 'Document Name', 'Size', 'Timestamp', 'Entities Redacted', 'Rules Applied', 'Status'];

    const rows = logs.map(log => [
        log.id,
        `"${log.name.replace(/"/g, '""')}"`,
        log.size,
        log.date,
        log.entitiesDiscovered.toString(),
        `"${log.rulesApplied.join(', ')}"`,
        log.status,
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `Ciphera_Compliance_Report_${formatDate()}.csv`);
}

// ── PDF Export ───────────────────────────────────────────────────────────────

export function exportAuditPDF(
    logs: AuditLogEntry[],
    stats: { totalDocs: number; totalEntities: number; activeRules: number },
    orgName = 'Ciphera',
): void {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    const pageW  = pdf.internal.pageSize.getWidth();
    const pageH  = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let   y      = margin;

    // ── Header ───────────────────────────────────────────────────────────────
    pdf.setFillColor(26, 26, 26);
    pdf.rect(0, 0, pageW, 80, 'F');

    pdf.setTextColor(255, 165, 0);
    pdf.setFontSize(20);
    pdf.setFont('helvetica', 'bold');
    pdf.text('CIPHERA', margin, 35);

    pdf.setTextColor(200, 200, 200);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Compliance Audit Report — Data Anonymization Log', margin, 52);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, margin, 65);

    // Compliance badge
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(pageW - margin - 120, 25, 120, 30, 4, 4, 'F');
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DPDP ACT 2023', pageW - margin - 60, 43, { align: 'center' });
    pdf.text('COMPLIANT', pageW - margin - 60, 52, { align: 'center' });

    y = 100;

    // ── Summary stats ─────────────────────────────────────────────────────────
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('SESSION SUMMARY', margin, y);
    y += 14;

    const statBoxes = [
        { label: 'Documents Secured', value: stats.totalDocs.toString() },
        { label: 'Entities Redacted', value: stats.totalEntities.toString() },
        { label: 'Active Rules',       value: stats.activeRules.toString() },
        { label: 'Audit Records',      value: logs.length.toString() },
    ];

    const boxW = (pageW - margin * 2 - 30) / 4;
    statBoxes.forEach((stat, i) => {
        const bx = margin + i * (boxW + 10);
        pdf.setFillColor(30, 30, 30);
        pdf.roundedRect(bx, y, boxW, 44, 4, 4, 'F');
        pdf.setDrawColor(60, 60, 60);
        pdf.roundedRect(bx, y, boxW, 44, 4, 4, 'S');

        pdf.setTextColor(255, 165, 0);
        pdf.setFontSize(20);
        pdf.setFont('helvetica', 'bold');
        pdf.text(stat.value, bx + boxW / 2, y + 24, { align: 'center' });

        pdf.setTextColor(150, 150, 150);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text(stat.label.toUpperCase(), bx + boxW / 2, y + 38, { align: 'center' });
    });

    y += 60;

    // ── Table header ──────────────────────────────────────────────────────────
    pdf.setTextColor(150, 150, 150);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('AUDIT TRAIL', margin, y);
    y += 10;

    const cols = [
        { label: 'RUN ID',      w: 70,  x: margin },
        { label: 'DOCUMENT',    w: 160, x: margin + 70 },
        { label: 'SIZE',        w: 50,  x: margin + 230 },
        { label: 'TIMESTAMP',   w: 130, x: margin + 280 },
        { label: 'ENTITIES',    w: 70,  x: margin + 410 },
        { label: 'STATUS',      w: 80,  x: margin + 480 },
    ];

    pdf.setFillColor(35, 35, 35);
    pdf.rect(margin, y, pageW - margin * 2, 20, 'F');

    cols.forEach(col => {
        pdf.setTextColor(180, 180, 180);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.text(col.label, col.x + 4, y + 13);
    });
    y += 20;

    // ── Table rows ────────────────────────────────────────────────────────────
    logs.forEach((log, idx) => {
        if (y > pageH - 60) {
            pdf.addPage();
            y = margin;
        }

        if (idx % 2 === 0) {
            pdf.setFillColor(22, 22, 22);
            pdf.rect(margin, y, pageW - margin * 2, 18, 'F');
        }

        const rowY = y + 12;

        pdf.setTextColor(255, 165, 0);
        pdf.setFontSize(7);
        pdf.setFont('courier', 'normal');
        pdf.text(log.id, cols[0].x + 4, rowY);

        pdf.setTextColor(220, 220, 220);
        pdf.setFont('helvetica', 'normal');
        const docName = log.name.length > 28 ? log.name.slice(0, 25) + '…' : log.name;
        pdf.text(docName, cols[1].x + 4, rowY);

        pdf.setTextColor(150, 150, 150);
        pdf.text(log.size, cols[2].x + 4, rowY);
        pdf.text(log.date, cols[3].x + 4, rowY);

        pdf.setTextColor(255, 255, 255);
        pdf.setFont('helvetica', 'bold');
        pdf.text(log.entitiesDiscovered.toString(), cols[4].x + 4, rowY);

        // Status badge
        const statusColor = log.status === 'Completed'
            ? [16, 185, 129] : log.status === 'Failed'
            ? [239, 68, 68] : [255, 165, 0];
        pdf.setFillColor(...(statusColor as [number, number, number]));
        pdf.roundedRect(cols[5].x + 4, y + 3, 60, 12, 3, 3, 'F');
        pdf.setTextColor(0, 0, 0);
        pdf.setFontSize(6.5);
        pdf.setFont('helvetica', 'bold');
        pdf.text(log.status.toUpperCase(), cols[5].x + 34, y + 11, { align: 'center' });

        y += 18;
    });

    // ── Footer ────────────────────────────────────────────────────────────────
    const totalPages = (pdf.internal as any).getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFillColor(20, 20, 20);
        pdf.rect(0, pageH - 30, pageW, 30, 'F');
        pdf.setTextColor(100, 100, 100);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'normal');
        pdf.text('CONFIDENTIAL — Generated by Ciphera V3 · Data anonymization compliant with DPDP Act 2023 & GDPR Article 25', margin, pageH - 12);
        pdf.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 12, { align: 'right' });
    }

    pdf.save(`Ciphera_Compliance_Report_${formatDate()}.pdf`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(): string {
    return new Date().toISOString().slice(0, 10);
}

function triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href    = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}