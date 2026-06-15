"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Shield, ChevronDown } from "lucide-react";

const sections = [
    {
        id: "overview",
        title: "Overview",
        content: `Ciphera is a PII (Personally Identifiable Information) anonymization system built for Indian enterprises and individuals. This Privacy Policy explains how Ciphera handles data when you use our platform.

The core principle of Ciphera is zero data retention. All document processing happens locally on your machine or on your self-hosted instance. We do not transmit, store, or process your documents on external servers.`,
    },
    {
        id: "data-we-collect",
        title: "Data We Collect",
        content: `Account Data — When you create an account, we collect your name, email address, and a hashed password. We do not store plaintext passwords.

Session Data — We store JSON Web Tokens (JWT) locally in your browser's localStorage to maintain your authenticated session. These expire after 15 minutes (access token) and 30 days (refresh token).

Audit Logs — When you process a document, a local audit log entry is created containing: document name, file size, timestamp, number of entities detected, and which rule types were applied. The actual document content is never stored in audit logs.

Usage Metrics — Anonymous aggregate counts (total documents secured, total entities redacted) stored in your browser's localStorage, namespaced to your user ID.

No Document Content — Ciphera never uploads, stores, or logs the content of any document you process.`,
    },
    {
        id: "local-inference",
        title: "Local Inference & Zero Retention",
        content: `All PII detection runs locally. The detection pipeline — comprising regex pattern matching, Microsoft Presidio NLP, and spaCy NER — executes entirely within your Docker container or local environment.

Your documents never leave your machine. The only network requests made during document processing are to your local backend (localhost:8000 or your self-hosted domain).

When ML context scoring is enabled via Groq, entity metadata (entity type, surrounding context window of approximately 60 characters, and confidence score) is sent to Groq's API for sensitivity assessment. The full document text is never sent. You can disable ML scoring in Settings → Language.`,
    },
    {
        id: "google-oauth",
        title: "Google Sign-In",
        content: `If you choose to sign in with Google, we receive your Google account email address, display name, and Google ID from Google's OAuth2 API. We request only the email and profile scopes — we do not request access to your Google Drive, Gmail, Calendar, or any other Google services.

Your Google credentials are never stored by Ciphera. We store only the derived user record (name, email, internal user ID) in our database.

Google's handling of your data during the OAuth flow is governed by Google's Privacy Policy at https://policies.google.com/privacy.`,
    },
    {
        id: "dpdp-compliance",
        title: "DPDP Act 2023 Compliance",
        content: `Ciphera is designed to comply with India's Digital Personal Data Protection Act 2023.

Data Minimization — We collect only the minimum data required to provide the service (name, email, hashed password).

Purpose Limitation — Data collected for account creation is used only for authentication and is not sold, shared, or used for advertising.

Right to Erasure — You may request deletion of your account and all associated data by emailing us. Account deletion removes your user record, all audit log entries, all API keys, and your organisation membership.

Data Principal Rights — As a data principal under the DPDP Act, you have the right to access, correct, and erase your personal data. Contact us to exercise these rights.

Breach Notification — In the event of a data breach affecting your personal data, we will notify you within 72 hours of becoming aware of the breach.`,
    },
    {
        id: "gdpr",
        title: "GDPR (EU Users)",
        content: `For users in the European Union, Ciphera complies with the General Data Protection Regulation (GDPR).

Legal Basis — We process your personal data on the basis of contract performance (providing the service you signed up for) and legitimate interest (security, fraud prevention).

Data Portability — You may request an export of your personal data in machine-readable format.

Right to Object — You may object to processing of your personal data at any time.

Data Transfers — Your data is stored on servers in the region you select during self-hosting. Ciphera does not transfer your data across borders without your knowledge.`,
    },
    {
        id: "api-keys",
        title: "API Keys",
        content: `API keys are cryptographically generated and stored in our database in hashed form. The full key is shown to you only once upon creation — we cannot retrieve it after that.

API key usage logs (endpoint called, timestamp, response time) are stored to enable the usage analytics displayed in your dashboard. These logs do not contain the content of requests.

API keys can be revoked at any time from Settings → API Keys or Account → API Keys.`,
    },
    {
        id: "cookies",
        title: "Cookies & Local Storage",
        content: `Ciphera uses the following browser storage:

ciphera_authed — A session cookie (SameSite=Lax, max-age 7 days) that indicates you are authenticated. Contains no personal data.

ciphera_guest — A session cookie (SameSite=Lax, max-age 7 days) for guest sessions. Contains no personal data.

ciphera_access_token — Stored in localStorage. Your short-lived JWT access token (15 minute expiry).

ciphera_refresh_token — Stored in localStorage. Your refresh token (30 day expiry).

ciphera_user — Stored in localStorage. Your user profile (name, email, plan, role). No sensitive data.

ciphera-session-{user_id} — Stored in localStorage. Your local session metrics (document count, entity count, recent audit log entries). Never synced to an external server unless you explicitly download an audit report.

We do not use third-party analytics cookies, advertising cookies, or tracking pixels of any kind.`,
    },
    {
        id: "third-parties",
        title: "Third-Party Services",
        content: `Groq — When ML scoring is enabled, entity metadata is sent to Groq (https://groq.com) for sensitivity assessment. Groq's privacy policy applies. You can disable this in Settings.

Google OAuth — Used for optional sign-in. Governed by Google's Privacy Policy.

No advertising networks, analytics platforms, or data brokers receive any data from Ciphera.`,
    },
    {
        id: "contact",
        title: "Contact & Data Requests",
        content: `For privacy-related requests including data access, correction, or deletion:

Email: privacy@ciphera.in
Response time: Within 72 hours for urgent requests, 7 days for standard requests.

For account deletion: Log in → Account → Delete Account, or email us with your registered email address.`,
    },
    {
        id: "changes",
        title: "Changes to This Policy",
        content: `We will notify you of material changes to this Privacy Policy by email (if you have an account) and by updating the "Last Updated" date below. Continued use of Ciphera after changes constitutes acceptance of the updated policy.`,
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

export default function PrivacyPolicyPage() {
    const [openSection, setOpenSection] = useState<string | null>("overview");

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
                        Privacy<br />Policy
                    </h1>
                    <div style={{ marginTop: "20px", display: "flex", gap: "16px", flexWrap: "wrap" }}>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)" }}>Last updated: June 2026</span>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(239,239,239,0.35)" }}>Version: 1.0</span>
                        <span style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "9px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#4ade80" }}>✓ DPDP Act 2023 Compliant</span>
                    </div>

                    {/* Summary box */}
                    <div style={{ marginTop: "28px", padding: "20px 24px", background: "rgba(245,196,0,0.04)", border: "1px solid rgba(245,196,0,0.2)", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "2px", background: "linear-gradient(90deg, transparent, #F5C400, transparent)", opacity: 0.5 }} />
                        <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.2em", textTransform: "uppercase", color: "#F5C400", marginBottom: "10px" }}>TL;DR — The short version</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {[
                                "Your documents never leave your machine.",
                                "We collect only your name and email to create an account.",
                                "No advertising. No analytics. No data brokers. Ever.",
                                "You can delete your account and all data at any time.",
                                "Google sign-in only requests your name and email.",
                            ].map((line, i) => (
                                <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                                    <span style={{ color: "#4ade80", fontFamily: '"IBM Plex Mono", monospace', fontSize: "10px", flexShrink: 0, marginTop: "1px" }}>✓</span>
                                    <span style={{ fontFamily: '"Barlow", sans-serif', fontSize: "13px", color: "rgba(239,239,239,0.7)", lineHeight: 1.6 }}>{line}</span>
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

                {/* Footer note */}
                <div style={{ marginTop: "40px", padding: "20px 24px", border: "1px solid rgba(239,239,239,0.07)", background: "#111113" }}>
                    <div style={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: "8px", letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(239,239,239,0.3)", marginBottom: "8px" }}>Governing Law</div>
                    <p style={{ fontFamily: '"Barlow", sans-serif', fontSize: "13px", color: "rgba(239,239,239,0.45)", lineHeight: 1.7, margin: 0 }}>
                        This Privacy Policy is governed by the laws of India, including the Digital Personal Data Protection Act 2023 and the Information Technology Act 2000. Any disputes arising from this policy shall be subject to the exclusive jurisdiction of the courts of Mumbai, Maharashtra.
                    </p>
                </div>

                {/* Back to home */}
                <div style={{ marginTop: "32px", display: "flex", justifyContent: "center" }}>
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