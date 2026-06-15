"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Shield, ChevronDown } from "lucide-react";

const sections = [
    {
        id: "acceptance",
        title: "Acceptance of Terms",
        content: `By accessing or using Ciphera ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.

These Terms apply to all users of the Service, including users with accounts, guest users, and API consumers. "Ciphera" refers to the PII anonymization platform and all associated services.`,
    },
    {
        id: "description",
        title: "Description of Service",
        content: `Ciphera is a Personally Identifiable Information (PII) detection and anonymization system. The Service allows users to:

Upload documents and detect PII entities using a multi-stage detection pipeline (Regex, Presidio NLP, spaCy NER, and voting ensemble).

Redact, mask, or replace detected PII before sharing or storing documents.

Generate compliance audit reports aligned with the DPDP Act 2023 and GDPR.

Access detection capabilities programmatically via authenticated REST API.

Process documents in batch and export results in multiple formats.

The Service operates locally — document content is processed on your machine or your self-hosted instance and is never transmitted to Ciphera's servers.`,
    },
    {
        id: "accounts",
        title: "Accounts and Registration",
        content: `Account Creation — You may create an account using an email address and password, or by signing in with Google. You must provide accurate information and keep it current.

Account Security — You are responsible for maintaining the confidentiality of your credentials and for all activity that occurs under your account. Notify us immediately of any unauthorized use.

Guest Access — Guest sessions allow limited use of the Service without registration. Guest session data is not persisted to any server and is lost when the session ends.

Account Deletion — You may delete your account at any time. Deletion removes all associated personal data, audit logs, API keys, and organisation membership within 30 days.

One Account Per Person — You may not create multiple accounts for the purpose of circumventing rate limits or usage restrictions.`,
    },
    {
        id: "permitted-use",
        title: "Permitted Use",
        content: `You may use the Service to:

Detect and redact PII from documents you own or have authorization to process.

Integrate the detection API into your own applications for legitimate privacy compliance purposes.

Generate audit reports for regulatory compliance.

Process documents on behalf of clients if you have appropriate data processing agreements in place.

You represent that all documents you process through the Service are documents you have legal authority to process, and that your use of the Service complies with all applicable laws.`,
    },
    {
        id: "prohibited",
        title: "Prohibited Use",
        content: `You may not use the Service to:

Process documents you do not have authorization to access or handle.

Attempt to reverse-engineer, decompile, or extract the detection models or algorithms.

Use the Service to identify individuals for surveillance, discrimination, or harassment.

Upload or process documents containing illegal content.

Attempt to circumvent rate limits, authentication, or access controls.

Resell or sublicense access to the Service without written permission.

Use the Service in any way that violates the DPDP Act 2023, GDPR, or any applicable privacy law.

Use automated scripts to generate excessive API calls beyond your rate limit.`,
    },
    {
        id: "api",
        title: "API Usage",
        content: `API Access — API access requires an authenticated account and a valid API key. API keys are personal and must not be shared publicly or committed to version control.

Rate Limits — Each API key is subject to rate limits as specified at key creation (default: 60 requests per minute). Exceeding rate limits may result in temporary suspension of the key.

Fair Use — The API is provided for integration into legitimate applications. Abuse of the API — including automated bulk processing beyond your plan limits — may result in account suspension.

API Key Security — You are responsible for securing your API keys. If a key is compromised, revoke it immediately from the dashboard and generate a new one.`,
    },
    {
        id: "data",
        title: "Data and Privacy",
        content: `Document Content — Ciphera does not store, transmit, or process your document content on external servers. All PII detection runs locally within your environment.

Account Data — We collect and store your name, email, and hashed password solely for authentication purposes. This data is handled in accordance with our Privacy Policy.

Audit Logs — Audit log metadata (document name, file size, entity count, rule types applied) is stored locally in your browser and optionally synced to your self-hosted instance. Document content is never included in audit logs.

Your obligations — You are responsible for ensuring that your use of the Service to process personal data of third parties complies with applicable privacy laws, including obtaining necessary consents and maintaining appropriate data processing agreements.

Our Privacy Policy, available at /privacy, is incorporated into these Terms by reference.`,
    },
    {
        id: "intellectual-property",
        title: "Intellectual Property",
        content: `Ciphera and its underlying technology, including the detection pipeline, user interface, and associated software, are proprietary to Ciphera and protected by applicable intellectual property laws.

You retain all rights to documents you process through the Service. Processing a document through Ciphera does not grant us any rights to that document or its contents.

You may not copy, modify, distribute, sell, or sublicense any part of the Service without our express written permission.

Open-source components used by Ciphera (including spaCy, Microsoft Presidio, and others) are governed by their respective licenses.`,
    },
    {
        id: "disclaimers",
        title: "Disclaimers and Limitation of Liability",
        content: `Detection Accuracy — The Service uses probabilistic detection methods. While we strive for high accuracy, Ciphera does not guarantee that all PII will be detected, or that no false positives will occur. You are responsible for reviewing detection results before acting on them.

No Legal Advice — Ciphera is a technical tool and does not constitute legal advice. Consult qualified legal counsel for compliance with specific regulatory requirements.

Service Availability — The Service is provided on an "as is" and "as available" basis. We do not guarantee uninterrupted or error-free operation.

Limitation of Liability — To the maximum extent permitted by applicable law, Ciphera shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, even if advised of the possibility of such damages.

Our total liability to you for any claims arising under these Terms shall not exceed the amount you paid for the Service in the twelve months preceding the claim.`,
    },
    {
        id: "termination",
        title: "Termination",
        content: `We may suspend or terminate your access to the Service at any time, with or without notice, if you violate these Terms or for any other reason at our discretion.

You may terminate your account at any time by deleting it from the Account settings page.

Upon termination, your right to use the Service immediately ceases. Provisions of these Terms that by their nature should survive termination shall survive, including ownership provisions, disclaimers, and limitations of liability.`,
    },
    {
        id: "changes",
        title: "Changes to Terms",
        content: `We reserve the right to modify these Terms at any time. We will notify you of material changes by email (if you have an account) and by updating the "Last Updated" date below.

Your continued use of the Service after changes constitutes your acceptance of the updated Terms. If you do not agree to the updated Terms, you must stop using the Service.`,
    },
    {
        id: "governing-law",
        title: "Governing Law",
        content: `These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of the Service shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.

If any provision of these Terms is found to be unenforceable, the remaining provisions will continue in full force and effect.

These Terms, together with our Privacy Policy, constitute the entire agreement between you and Ciphera regarding your use of the Service.`,
    },
    {
        id: "contact",
        title: "Contact",
        content: `For questions about these Terms, contact us at:

Email: legal@ciphera.in
Response time: Within 7 business days.

For urgent matters including account security or data breach notifications, use privacy@ciphera.in.`,
    },
];

function AccordionSection({ section, isOpen, onToggle }: {
    section: typeof sections[0];
    isOpen: boolean;
    onToggle: () => void;
}) {
    return (
        <div style={{ borderBottom: "1px solid rgba(239,239,239,0.07)" }}>
            <button onClick={onToggle}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(245,196,0,0.02)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 700, fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.06em", color: isOpen ? "#F5C400" : "#EFEFEF", transition: "color 0.15s" }}>
                    {section.title}
                </span>
                <ChevronDown style={{ width: 16, height: 16, color: isOpen ? "#F5C400" : "rgba(239,239,239,0.3)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "all 0.2s", flexShrink: 0 }} />
            </button>
            {isOpen && (
                <div style={{ padding: "0 24px 20px" }}>
                    {section.content.split("\n\n").map((para, i) => (
                        <p key={i} style={{ fontFamily: '"Barlow", sans-serif', fontSize: "14px", fontWeight: 400, color: "rgba(239,239,239,0.65)", lineHeight: 1.8, margin: 0, marginBottom: i < section.content.split("\n\n").length - 1 ? "14px" : 0 }}>
                            {para}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function TermsPage() {
    const [openSection, setOpenSection] = useState<string | null>("acceptance");
    const toggle = (id: string) => setOpenSection(prev => prev === id ? null : id);

    return (
        <div style={{ minHeight: "100vh", background: "#080808", color: "#EFEFEF", cursor: "none" }}>

            {/* Nav */}
            <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(8,8,8,0.95)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(239,239,239,0.07)", padding: "14px clamp(36px,5vw,80px)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ background: "#F5C400", padding: "6px", display: "flex" }}>
                        <Shield style={{ width: 14, height: 14, color: "#080808" }} />
                    </div>
                    <span style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "18px", letterSpacing: "0.1em", textTransform: "uppercase", color: "#EFEFEF" }}>Ciphera</span>
                </Link>
                <Link href="/register" style={{ background: "#F5C400", color: "#080808", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700, padding: "8px 18px", textDecoration: "none", transition: "all 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#ffe166"}
                    onMouseLeave={e => e.currentTarget.style.background = "#F5C400"}>
                    Get Started →
                </Link>
            </nav>

            <main style={{ maxWidth: "800px", margin: "0 auto", padding: "120px 32px 80px" }}>

                {/* Header */}
                <div style={{ marginBottom: "48px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <div style={{ width: "18px", height: "2px", background: "rgba(185,28,28,0.8)" }} />
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.26em", textTransform: "uppercase", color: "rgba(185,28,28,0.8)" }}>// Legal</span>
                    </div>
                    <h1 style={{ fontFamily: '"Barlow Condensed", sans-serif', fontWeight: 900, fontSize: "clamp(40px,6vw,72px)", textTransform: "uppercase", letterSpacing: "-0.01em", color: "#EFEFEF", margin: 0, lineHeight: 0.9 }}>
                        Terms of<br />Service
                    </h1>
                    <div style={{ marginTop: "20px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)" }}>Last updated: June 2026</span>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)" }}>Version: 1.0</span>
                    </div>

                    {/* Key points box */}
                    <div style={{ marginTop: "28px", padding: "20px 24px", background: "rgba(239,239,239,0.02)", border: "1px solid rgba(239,239,239,0.08)" }}>
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(239,239,239,0.4)", marginBottom: "10px" }}>Key points</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {[
                                "You own your documents — we never claim rights to what you process.",
                                "The Service does not guarantee 100% PII detection accuracy. Always review results.",
                                "API keys are your responsibility — secure them and revoke if compromised.",
                                "Guest sessions have limited functionality and no data persistence.",
                                "You may delete your account and all data at any time.",
                            ].map((line, i) => (
                                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <span style={{ color: "rgba(245,196,0,0.6)", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", flexShrink: 0, marginTop: "1px" }}>—</span>
                                    <span style={{ fontFamily: '"Barlow", sans-serif', fontSize: "13px", color: "rgba(239,239,239,0.55)", lineHeight: 1.6 }}>{line}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Accordion sections */}
                <div style={{ border: "1px solid rgba(239,239,239,0.1)", background: "#111113" }}>
                    {sections.map(section => (
                        <AccordionSection
                            key={section.id}
                            section={section}
                            isOpen={openSection === section.id}
                            onToggle={() => toggle(section.id)}
                        />
                    ))}
                </div>

                {/* Links to other legal pages */}
                <div style={{ marginTop: "32px", display: "flex", gap: "20px", justifyContent: "center", flexWrap: "wrap" }}>
                    <Link href="/privacy" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#F5C400"}
                        onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.35)"}>
                        Privacy Policy →
                    </Link>
                    <Link href="/" style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)", textDecoration: "none", transition: "color 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.color = "#EFEFEF"}
                        onMouseLeave={e => e.currentTarget.style.color = "rgba(239,239,239,0.35)"}>
                        ← Back to Ciphera
                    </Link>
                </div>
            </main>
        </div>
    );
}