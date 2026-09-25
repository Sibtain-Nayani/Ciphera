import os
import random
import string
from pathlib import Path

# -- Try imports, tell user what to install if missing -------------------------
try:
    from reportlab.lib.pagesizes import A4, letter
    from reportlab.lib import colors
    from reportlab.lib.units import mm, cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Table, TableStyle,
        Spacer, HRFlowable,
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
    from reportlab.pdfgen import canvas as pdfcanvas
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    REPORTLAB = True
except ImportError:
    REPORTLAB = False
    print("!  reportlab not found. Run: pip install reportlab")

try:
    from faker import Faker
    fake = Faker('en_IN')
    FAKER = True
except ImportError:
    FAKER = False
    print("!  faker not found. Run: pip install faker")

OUT = Path("test_docs")
OUT.mkdir(exist_ok=True)
for sub in ["1_format_modality","2_layout_structure","3_pii_entity","4_adversarial","5_txt_samples"]:
    (OUT / sub).mkdir(exist_ok=True)

# -- Indian PII helpers --------------------------------------------------------
def random_aadhaar(spaced=True):
    d = "".join([str(random.randint(0,9)) for _ in range(12)])
    d = str(random.randint(2,9)) + d[1:]  # valid first digit
    return f"{d[:4]} {d[4:8]} {d[8:]}" if spaced else d

def random_pan():
    letters = string.ascii_uppercase
    return (random.choice(letters)*5 +
            str(random.randint(1000,9999)) +
            random.choice(letters))

def random_pan_real():
    cats = ['P','C','H','F','A','T','B','L','J','G']
    return (f"{''.join(random.choices(string.ascii_uppercase,k=3))}"
            f"{random.choice(cats)}"
            f"{random.choice(string.ascii_uppercase)}"
            f"{random.randint(1000,9999)}"
            f"{random.choice(string.ascii_uppercase)}")

def random_gstin():
    states = ["27","07","29","33","24","09"]
    pan    = random_pan_real()
    return f"{random.choice(states)}{pan}1Z5"

def random_ifsc():
    banks = ["SBIN","HDFC","ICIC","AXIS","PUNB","UBIN","CNRB"]
    return f"{random.choice(banks)}0{''.join(random.choices(string.digits,k=6))}"

def random_upi():
    handles = ["okaxis","ybl","upi","okhdfcbank","oksbi","ibl","axl"]
    name    = fake.first_name().lower() if FAKER else "rahul"
    return f"{name}{random.randint(10,99)}@{random.choice(handles)}"

def random_phone():
    return f"+91 {''.join(random.choices('6789',k=1))}{''.join(random.choices(string.digits,k=4))} {''.join(random.choices(string.digits,k=5))}"

def random_bank_account():
    return "".join(random.choices(string.digits, k=random.randint(9,16)))

def random_voter_id():
    return ("".join(random.choices(string.ascii_uppercase, k=3)) +
            "".join(random.choices(string.digits, k=7)))

def random_driving_licence():
    state_codes = ["MH","DL","KA","TN","GJ","RJ"]
    return (f"{random.choice(state_codes)}-"
            f"{random.randint(10,23)}-"
            f"{''.join(random.choices(string.digits, k=4))}-"
            f"{''.join(random.choices(string.digits, k=7))}")


# =============================================================================
# CATEGORY 1 — FORMAT & MODALITY
# =============================================================================

def make_1a_clean_digital_pdf():
    """Native digital PDF — clean text layer, baseline test."""
    if not REPORTLAB: return
    path = OUT / "1_format_modality" / "1a_clean_digital_kyc.pdf"
    doc  = SimpleDocTemplate(str(path), pagesize=A4)
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=16, spaceAfter=8)
    H2 = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, spaceAfter=6)
    N  = ParagraphStyle('N',  parent=styles['Normal'],  fontSize=11, leading=16)

    name   = fake.name() if FAKER else "Rahul Sharma"
    email  = fake.email() if FAKER else "rahul.sharma@example.com"
    phone  = random_phone()
    dob    = "15/08/1992"
    aadh   = random_aadhaar(spaced=True)
    pan    = random_pan_real()
    gst    = random_gstin()
    ifsc   = random_ifsc()
    acc    = random_bank_account()
    addr   = (fake.address().replace('\n',', ') if FAKER
              else "42, MG Road, Bandra West, Mumbai - 400050")
    upi    = random_upi()
    voter  = random_voter_id()
    dl     = random_driving_licence()

    story = [
        Paragraph("KNOW YOUR CUSTOMER (KYC) FORM", H1),
        Paragraph("Standard Banking Verification — Individual Account", H2),
        HRFlowable(width="100%", thickness=1, color=colors.grey),
        Spacer(1, 10),
        Paragraph(f"<b>Full Name:</b> {name}", N),
        Paragraph(f"<b>Date of Birth:</b> {dob}", N),
        Paragraph(f"<b>Email Address:</b> {email}", N),
        Paragraph(f"<b>Mobile Number:</b> {phone}", N),
        Paragraph(f"<b>Residential Address:</b> {addr}", N),
        Spacer(1, 10),
        Paragraph("IDENTITY DOCUMENTS", H2),
        Paragraph(f"<b>Aadhaar Number:</b> {aadh}", N),
        Paragraph(f"<b>PAN Number:</b> {pan}", N),
        Paragraph(f"<b>Voter ID:</b> {voter}", N),
        Paragraph(f"<b>Driving Licence:</b> {dl}", N),
        Spacer(1, 10),
        Paragraph("FINANCIAL DETAILS", H2),
        Paragraph(f"<b>Bank Account Number:</b> {acc}", N),
        Paragraph(f"<b>IFSC Code:</b> {ifsc}", N),
        Paragraph(f"<b>UPI ID:</b> {upi}", N),
        Paragraph(f"<b>GSTIN (if applicable):</b> {gst}", N),
        Spacer(1, 20),
        Paragraph(
            "I hereby declare that the above information is true and correct to "
            "the best of my knowledge. I authorise the bank to verify the same.",
            N,
        ),
        Spacer(1, 30),
        Paragraph(f"Signature: ______________________    Date: {dob[:5]}2026", N),
    ]
    doc.build(story)
    print(f"  [DONE]  {path.name}")


def make_1b_multipage_pdf():
    """Multi-page PDF — tests page boundary handling."""
    if not REPORTLAB: return
    path = OUT / "1_format_modality" / "1b_multipage_report.pdf"
    doc  = SimpleDocTemplate(str(path), pagesize=A4)
    styles = getSampleStyleSheet()
    N  = ParagraphStyle('N',  parent=styles['Normal'],  fontSize=11, leading=18)
    H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=14, spaceAfter=8)

    story = []
    for page_num in range(1, 5):
        name  = fake.name() if FAKER else f"Person {page_num}"
        email = fake.email() if FAKER else f"person{page_num}@example.com"
        story.extend([
            Paragraph(f"EMPLOYEE RECORD — PAGE {page_num}", H1),
            Paragraph(f"Employee Name: {name}", N),
            Paragraph(f"Email: {email}", N),
            Paragraph(f"Aadhaar: {random_aadhaar()}", N),
            Paragraph(f"PAN: {random_pan_real()}", N),
            Paragraph(f"Salary Account: {random_bank_account()}", N),
            Paragraph(f"IFSC: {random_ifsc()}", N),
            Paragraph(f"UPI: {random_upi()}", N),
            Spacer(1, 400),  # force page break
        ])
    doc.build(story)
    print(f"  [DONE]  {path.name}")


# =============================================================================
# CATEGORY 2 — LAYOUT & STRUCTURE
# =============================================================================

def make_2a_dense_table_pdf():
    """Financial statement with dense table — tests bounding box bleeding."""
    if not REPORTLAB: return
    path = OUT / "2_layout_structure" / "2a_payroll_statement.pdf"
    doc  = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=15*mm, rightMargin=15*mm)
    styles = getSampleStyleSheet()
    N  = ParagraphStyle('N',  parent=styles['Normal'],  fontSize=9)
    H1 = ParagraphStyle('H1', parent=styles['Heading1'], fontSize=14)

    headers = ["Emp ID","Name","PAN","Aadhaar","Bank Account","IFSC","UPI","Gross (₹)","Net (₹)"]
    rows    = [headers]
    for i in range(20):
        name = fake.name()[:18] if FAKER else f"Employee {i+1:02d}"
        rows.append([
            f"EMP{1000+i}",
            name,
            random_pan_real(),
            random_aadhaar(spaced=False),
            random_bank_account()[:14],
            random_ifsc(),
            random_upi()[:18],
            f"{random.randint(30,150)*1000:,}",
            f"{random.randint(25,130)*1000:,}",
        ])

    table = Table(rows, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR',  (0,0), (-1,0), colors.white),
        ('FONTSIZE',   (0,0), (-1,-1), 7),
        ('GRID',       (0,0), (-1,-1), 0.5, colors.grey),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f5f5f5')]),
        ('ALIGN',      (0,0), (-1,-1), 'CENTER'),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
        ('PADDING',    (0,0), (-1,-1), 3),
    ]))

    story = [
        Paragraph("MONTHLY PAYROLL STATEMENT — JUNE 2026", H1),
        Spacer(1, 8),
        table,
    ]
    doc.build(story)
    print(f"  [DONE]  {path.name}")


def make_2b_two_column_pdf():
    """Two-column newsletter layout — tests column reading order."""
    if not REPORTLAB: return
    path   = OUT / "2_layout_structure" / "2b_two_column_newsletter.pdf"
    c      = pdfcanvas.Canvas(str(path), pagesize=A4)
    w, h   = A4
    col_w  = (w - 60) / 2
    col1_x = 20
    col2_x = col1_x + col_w + 20

    def draw_column(x, y_start, title, body_lines):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(x, y_start, title)
        c.setFont("Helvetica", 9)
        y = y_start - 18
        for line in body_lines:
            if y < 40: break
            c.drawString(x, y, line[:80])
            y -= 13
        return y

    name1  = fake.name() if FAKER else "Priya Mehta"
    email1 = fake.email() if FAKER else "priya.mehta@company.in"
    aadh1  = random_aadhaar()
    pan1   = random_pan_real()

    name2  = fake.name() if FAKER else "Amit Singh"
    email2 = fake.email() if FAKER else "amit.singh@company.in"
    aadh2  = random_aadhaar()
    pan2   = random_pan_real()

    col1_lines = [
        f"Name: {name1}",
        f"Email: {email1}",
        f"Aadhaar: {aadh1}",
        f"PAN: {pan1}",
        f"Phone: {random_phone()}",
        f"DOB: 22/03/1989",
        f"Address: 14, Linking Road, Bandra,",
        f"  Mumbai, Maharashtra - 400050",
        f"Account: {random_bank_account()}",
        f"IFSC: {random_ifsc()}",
        f"UPI: {random_upi()}",
        "",
        "DECLARATION",
        "I hereby confirm that all details",
        "provided above are accurate and",
        "true to the best of my knowledge.",
        "Any misrepresentation may lead to",
        "legal consequences under applicable",
        "Indian laws.",
    ]

    col2_lines = [
        f"Name: {name2}",
        f"Email: {email2}",
        f"Aadhaar: {aadh2}",
        f"PAN: {pan2}",
        f"Phone: {random_phone()}",
        f"DOB: 08/11/1985",
        f"Address: 5, Koregaon Park, Pune,",
        f"  Maharashtra - 411001",
        f"Account: {random_bank_account()}",
        f"IFSC: {random_ifsc()}",
        f"UPI: {random_upi()}",
        "",
        "WITNESS",
        "Name: " + (fake.name() if FAKER else "Ravi Kumar"),
        "ID: " + random_voter_id(),
        "Date: 15/06/2026",
    ]

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(w/2, h - 30, "EMPLOYEE DATA SHEET — Q2 2026")
    c.line(20, h-40, w-20, h-40)

    draw_column(col1_x, h - 60, "COLUMN A — Employee 1", col1_lines)
    draw_column(col2_x, h - 60, "COLUMN B — Employee 2", col2_lines)

    # Vertical divider
    c.setStrokeColor(colors.grey)
    c.line(col1_x + col_w + 10, h - 55, col1_x + col_w + 10, 40)

    c.save()
    print(f"  [DONE]  {path.name}")


def make_2c_rotated_watermark_pdf():
    """PDF with rotated watermark text — tests rotation handling."""
    if not REPORTLAB: return
    path = OUT / "2_layout_structure" / "2c_rotated_watermark.pdf"
    c    = pdfcanvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    # Normal content
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h - 50, "CONFIDENTIAL MEDICAL RECORD")
    c.setFont("Helvetica", 11)
    y = h - 80
    lines = [
        f"Patient Name: {fake.name() if FAKER else 'Sunita Rao'}",
        f"Date of Birth: 12/04/1978",
        f"Aadhaar: {random_aadhaar()}",
        f"Mobile: {random_phone()}",
        f"Email: {fake.email() if FAKER else 'sunita.rao@gmail.com'}",
        f"Doctor: Dr. Rajesh Iyer, MD",
        f"Diagnosis: Hypertension Stage 2",
        f"Prescribed: Amlodipine 5mg OD",
        f"Insurance ID: STAR-HLT-2026-{random.randint(10000,99999)}",
    ]
    for line in lines:
        c.drawString(40, y, line)
        y -= 22

    # Rotated watermark (diagonal)
    c.saveState()
    c.setFont("Helvetica-Bold", 60)
    c.setFillColor(colors.Color(0.85, 0.85, 0.85, alpha=0.4))
    c.translate(w/2, h/2)
    c.rotate(45)
    c.drawCentredString(0, 0, "CONFIDENTIAL")
    c.restoreState()

    # Rotated margin note (90 degrees)
    c.saveState()
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.red)
    c.translate(15, h/2)
    c.rotate(90)
    c.drawString(0, 0, f"REF: MR-{random.randint(100000,999999)} | AADHAAR: {random_aadhaar(spaced=False)}")
    c.restoreState()

    c.save()
    print(f"  [DONE]  {path.name}")


# =============================================================================
# CATEGORY 3 — PII & ENTITY VARIATIONS
# =============================================================================

def make_3a_standard_pii_txt():
    """Dense standard PII — names, emails, phones, dates."""
    path = OUT / "3_pii_entity" / "3a_standard_pii_dense.txt"
    lines = [
        "EMPLOYEE CONTACT DIRECTORY — INTERNAL USE ONLY",
        "=" * 60,
        "",
    ]
    for i in range(15):
        name  = fake.name()  if FAKER else f"Person {i+1}"
        email = fake.email() if FAKER else f"person{i+1}@company.com"
        dob   = f"{random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(1975,2000)}"
        lines += [
            f"Name:   {name}",
            f"Email:  {email}",
            f"Phone:  {random_phone()}",
            f"DOB:    {dob}",
            f"Joined: {random.randint(1,28):02d}/{random.randint(1,12):02d}/20{random.randint(15,24):02d}",
            "",
        ]
    path.write_text("\n".join(lines))
    print(f"  [DONE]  {path.name}")


def make_3b_indian_pii_txt():
    """Dense Indian PII — Aadhaar with/without spaces, PAN, GSTIN, IFSC."""
    path = OUT / "3_pii_entity" / "3b_indian_pii_dense.txt"
    content = f"""VENDOR ONBOARDING FORM — PROCUREMENT PORTAL

SECTION A: IDENTITY VERIFICATION

Vendor Name: Lakshmi Enterprises Pvt. Ltd.
Proprietor: {fake.name() if FAKER else 'Suresh Lakshmi'}
Contact Person: {fake.name() if FAKER else 'Meena Lakshmi'}
Mobile: {random_phone()}
Email: {fake.email() if FAKER else 'suresh.lakshmi@lakshmienterprises.in'}

Aadhaar (spaced):   {random_aadhaar(spaced=True)}
Aadhaar (compact):  {random_aadhaar(spaced=False)}
PAN Number:         {random_pan_real()}
GSTIN:              {random_gstin()}
Voter ID:           {random_voter_id()}
Driving Licence:    {random_driving_licence()}
Passport No:        Z{random.randint(1000000,9999999)}

SECTION B: BANKING DETAILS

Bank Name:        State Bank of India
Account Number:   {random_bank_account()}
IFSC Code:        {random_ifsc()}
UPI ID:           {random_upi()}
Account Type:     Current

SECTION C: GST FILING HISTORY

Q1 2026 GSTIN: {random_gstin()} — Filed on 15/04/2026
Q2 2026 GSTIN: {random_gstin()} — Pending

SECTION D: SECONDARY CONTACT

Alternate Contact: {fake.name() if FAKER else 'Vijay Kumar'}
Alternate Aadhaar: {random_aadhaar()}
Alternate PAN:     {random_pan_real()}
Alternate Mobile:  {random_phone()}
Alternate Email:   {fake.email() if FAKER else 'vijay.kumar@lakshmienterprises.in'}

CERTIFICATION
I certify that all above information is accurate.
Signature: _______________
Date: 20/06/2026
"""
    path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  {path.name}")


def make_3c_contextual_ambiguity_txt():
    """Contextual ambiguity — same word as PII vs not-PII."""
    path = OUT / "3_pii_entity" / "3c_contextual_ambiguity.txt"
    content = """CONTEXTUAL AMBIGUITY TEST DOCUMENT
===================================
This document is designed to test the NLP engine's ability to
distinguish between real PII and surface-level false positives.

--- TEST 1: LOCATION VS PERSON ---
"I will visit you in Washington." [Expected: LOCATION]
"Washington called me yesterday about the merger." [Expected: PERSON]
"The Washington Post reported on the incident." [Expected: ORG/neither]
"Mr. Washington Fernandes submitted his Aadhaar: """ + random_aadhaar() + """ [Expected: PERSON + AADHAAR]

--- TEST 2: DATE VS PHONE ---
"Call me on 9876543210." [Expected: PHONE]
"The meeting is on 98/76/5432." [Expected: NOT a date — malformed]
"Born on 15/08/1992 in Mumbai." [Expected: DATE_OF_BIRTH]
"Reference ID: 15081992 — not a date." [Expected: probably not detected]

--- TEST 3: ORGANIZATION VS PERSON ---
"Please contact Rahul at rahul.sharma@hdfc.co.in." [Expected: EMAIL + PERSON]
"HDFC Bank processed the NEFT." [Expected: ORG]
"The HDFC account number is """ + random_bank_account() + """." [Expected: ORG + BANK_ACCOUNT]

--- TEST 4: NORMAL NUMBERS VS AADHAAR ---
"Our invoice number is 432588129901." [Expected: probably NOT Aadhaar — no context]
"My Aadhaar is """ + random_aadhaar() + """." [Expected: AADHAAR — context keyword]
"Order #432588129901 has been shipped." [Expected: NOT Aadhaar]

--- TEST 5: EMAIL VS UPI ---
"Pay me at: """ + random_upi() + """ [Expected: UPI_ID]
"Email me at: """ + (fake.email() if FAKER else "rahul@gmail.com") + """ [Expected: EMAIL]
"Both are addresses: """ + (fake.email() if FAKER else "test@company.com") + """ and """ + random_upi() + """

--- TEST 6: INDIAN NAMES VS LOCATIONS ---
"Anjali lives in Bangalore." [Expected: PERSON + LOCATION]
"Anjali said Bangalore is beautiful." [Expected: PERSON + LOCATION]
"The Bangalore office handles Karnataka GST: """ + random_gstin() + """

--- TEST 7: PAN IN CONTEXT ---
"His PAN is """ + random_pan_real() + """ as per the IT return." [Expected: PAN]
"The pan was dirty after cooking." [Expected: NOT PAN]
"ABCDE1234F is the PAN for this company." [Expected: PAN — format match even without keyword]
"""
    path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  {path.name}")


def make_3d_hindi_mixed_txt():
    """Hindi + English mixed document — tests bilingual pipeline."""
    path = OUT / "3_pii_entity" / "3d_hindi_english_mixed.txt"
    content = f"""बैंक खाता विवरण फॉर्म
BANK ACCOUNT DETAILS FORM

-- हिंदी भाग / HINDI SECTION --

नाम: रवि शर्मा
पिता का नाम: राजेश शर्मा
जन्म तिथि: 15/08/1985
आधार संख्या: {random_aadhaar()}
पैन नंबर: {random_pan_real()}
मोबाइल नंबर: {random_phone()}
पता: 42, गांधी नगर, जयपुर - 302001
जीएसटी नंबर: {random_gstin()}
पिन कोड: 302001

-- ENGLISH SECTION --

Name: Ravi Sharma
Email: {fake.email() if FAKER else 'ravi.sharma@gmail.com'}
Bank Account: {random_bank_account()}
IFSC Code: {random_ifsc()}
UPI ID: {random_upi()}
Voter ID: {random_voter_id()}

-- मिश्रित वाक्य / MIXED SENTENCES --

रवि Sharma ने अपना Aadhaar {random_aadhaar()} submit किया।
The account number खाता संख्या {random_bank_account()} है।
Contact करें: {random_phone()} या {fake.email() if FAKER else 'ravi@example.com'}

मैं यह प्रमाणित करता हूं कि उपरोक्त जानकारी सत्य है।
I hereby certify the above information is true.

हस्ताक्षर / Signature: _______________
दिनांक / Date: 20/06/2026
"""
    path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  {path.name}")


# =============================================================================
# CATEGORY 4 — ADVERSARIAL EDGE CASES
# =============================================================================

def make_4a_hidden_text_pdf():
    """Hidden white text on white background — critical test."""
    if not REPORTLAB: return
    path = OUT / "4_adversarial" / "4a_hidden_white_text.pdf"
    c    = pdfcanvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    # Visible content
    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h-50, "ANNUAL LEAVE APPLICATION FORM")
    c.setFont("Helvetica", 11)
    c.drawString(40, h-80,  "Employee Name: Kavita Desai")
    c.drawString(40, h-100, "Department: Finance")
    c.drawString(40, h-120, "Leave From: 01/07/2026")
    c.drawString(40, h-140, "Leave To:   10/07/2026")
    c.drawString(40, h-160, "Reason: Annual family vacation")

    # HIDDEN: white text on white background
    # This is the adversarial test — NLP must find it via text layer extraction
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.white)  # INVISIBLE to human eye
    hidden_aadh = random_aadhaar(spaced=False)
    hidden_pan  = random_pan_real()
    hidden_acc  = random_bank_account()
    c.drawString(40, h-200, f"HIDDEN_AADHAAR:{hidden_aadh} HIDDEN_PAN:{hidden_pan}")
    c.drawString(40, h-215, f"HIDDEN_ACCOUNT:{hidden_acc} HIDDEN_UPI:{random_upi()}")
    c.drawString(40, h-230, f"HIDDEN_EMAIL:{fake.email() if FAKER else 'kavita.desai@secret.com'}")

    # Back to visible
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(40, h-280,
        "NOTE: This PDF contains hidden white text above this line.")
    c.drawString(40, h-295,
        "A proper PDF redaction system must extract the text layer")
    c.drawString(40, h-310,
        "and detect PII even when it is visually invisible.")
    c.drawString(40, h-325,
        f"Hidden Aadhaar was: {hidden_aadh}")
    c.drawString(40, h-340,
        f"Hidden PAN was: {hidden_pan}")

    # Add a white rectangle over some visible text (simulates covering PII with shape)
    c.setFillColor(colors.white)
    c.rect(38, h-162, 300, 16, fill=1, stroke=0)
    c.setFillColor(colors.black)
    c.drawString(40, h-360,
        "A white rect was drawn over the Leave To date above.")
    c.drawString(40, h-375,
        "Visual redaction systems relying on image only would miss it.")

    c.save()
    print(f"  [DONE]  {path.name}")


def make_4b_micro_text_pdf():
    """0pt and 1pt font size PII — tests minimum size detection."""
    if not REPORTLAB: return
    path = OUT / "4_adversarial" / "4b_micro_text.pdf"
    c    = pdfcanvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h-50, "MICRO TEXT ADVERSARIAL TEST")
    c.setFont("Helvetica", 11)
    c.drawString(40, h-80, "This document contains PII at various font sizes.")
    c.drawString(40, h-100, "Normal 11pt line — Name: Sundar Krishnan, PAN: " + random_pan_real())

    # 6pt
    c.setFont("Helvetica", 6)
    c.drawString(40, h-125, f"6pt: Aadhaar {random_aadhaar()} Email {fake.email() if FAKER else 'test@test.com'}")

    # 4pt
    c.setFont("Helvetica", 4)
    c.drawString(40, h-142, f"4pt: Account {random_bank_account()} IFSC {random_ifsc()} UPI {random_upi()}")

    # 2pt
    c.setFont("Helvetica", 2)
    c.drawString(40, h-153, f"2pt: PAN {random_pan_real()} Voter {random_voter_id()} Phone {random_phone()}")

    # 1pt (barely exists)
    c.setFont("Helvetica", 1)
    c.drawString(40, h-160, f"1pt: Aadhaar {random_aadhaar(spaced=False)} GSTIN {random_gstin()}")

    # Back to normal
    c.setFont("Helvetica", 11)
    c.drawString(40, h-185, "Normal 11pt resume — PAN extraction should work at all sizes above.")
    c.drawString(40, h-205, "The text layer in PDF is font-size-independent — extraction")
    c.drawString(40, h-220, "should catch all sizes. OCR on scanned version would miss tiny text.")

    c.save()
    print(f"  [DONE]  {path.name}")


def make_4c_overlapping_layers_pdf():
    """Two text layers perfectly overlapping — duplicate entity test."""
    if not REPORTLAB: return
    path = OUT / "4_adversarial" / "4c_overlapping_text_layers.pdf"
    c    = pdfcanvas.Canvas(str(path), pagesize=A4)
    w, h = A4

    aadh = random_aadhaar()
    pan  = random_pan_real()
    email = fake.email() if FAKER else "overlap@test.com"

    c.setFont("Helvetica-Bold", 14)
    c.drawString(40, h-50, "OVERLAPPING TEXT LAYER TEST")
    c.setFont("Helvetica", 11)
    c.drawString(40, h-80, "Below this line, two text strings are drawn at identical coordinates.")
    c.drawString(40, h-100,"The detection engine should not double-count or crash.")

    # Draw text, then draw same text again at exact same position (2 PDF text objects)
    for _ in range(2):
        c.setFont("Helvetica", 11)
        c.drawString(40, h-130, f"Aadhaar: {aadh}")
        c.drawString(40, h-150, f"PAN: {pan}")
        c.drawString(40, h-170, f"Email: {email}")
        c.drawString(40, h-190, f"Account: {random_bank_account()}")

    # Slightly offset overlap (1 pixel off — creates visual blur)
    c.setFont("Helvetica", 11)
    c.drawString(41, h-220, f"Slightly offset: {aadh}")  # 1pt offset
    c.drawString(40, h-220, f"Slightly offset: {aadh}")

    c.setFont("Helvetica", 9)
    c.drawString(40, h-260, "Expected: Entity detected once per span. No crash. No duplicate entries.")

    c.save()
    print(f"  [DONE]  {path.name}")


def make_4d_pii_inside_image_note_txt():
    """Instructions for manual image-based PII test."""
    path = OUT / "4_adversarial" / "4d_image_embedded_pii_instructions.txt"
    content = """IMAGE-EMBEDDED PII TEST — MANUAL STEPS
========================================

This test requires manual setup. Follow these steps:

STEP 1 — Prepare the image:
  a. Take a clear photo of ANY government ID card (use a fake/dummy card for testing)
     OR use the sample text below printed and photographed.
  b. Alternatively, screenshot the following text rendered in a browser:

     ┌─────────────────────────────────────────────┐
     │  SAMPLE KYC CARD (FAKE — FOR TESTING ONLY) │
     │                                             │
     │  Name:    """ + (fake.name() if FAKER else "Ravi Kumar Sharma") + """              │
     │  DOB:     15/08/1990                        │
     │  Aadhaar: """ + random_aadhaar() + """         │
     │  PAN:     """ + random_pan_real() + """               │
     │  Mobile:  """ + random_phone() + """          │
     └─────────────────────────────────────────────┘

STEP 2 — Upload to Ciphera:
  a. Open localhost:3000/redact
  b. Click Load File → select your .jpg or .png
  c. Canvas mode should activate automatically
  d. Wait for face detection + OCR to complete

STEP 3 — Verify:
  - Check if Aadhaar and PAN bounding boxes align with text in the image
  - Check if boxes bleed over grid lines or cell borders
  - Try resizing a bounding box (partial redaction test)
  - Draw a custom box over empty white space
  - Export and verify black boxes appear in correct positions

EXPECTED RESULTS:
  - OCR extracts text correctly → pipeline detects PII
  - Bounding boxes drawn on canvas at correct pixel coordinates
  - Export creates clean redacted image with black fills
"""
    path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  {path.name}")


# =============================================================================
# CATEGORY 5 — TXT SAMPLES (quick paste-in tests)
# =============================================================================

def make_5_quick_test_samples():
    """Quick copy-paste samples for testing the text input box."""
    path = OUT / "5_txt_samples" / "quick_paste_tests.txt"
    content = f"""QUICK PASTE TEST SAMPLES FOR CIPHERA REDACT PAGE
==================================================
Copy any block below and paste into the redact workspace.

--- BLOCK 1: MINIMAL (single entity) ---
My Aadhaar number is {random_aadhaar()}.

--- BLOCK 2: HIGH DENSITY (all 21 types) ---
Full Name: {fake.name() if FAKER else 'Anjali Sharma'}
Date of Birth: 22/03/1991
Email: {fake.email() if FAKER else 'anjali.sharma@gmail.com'}
Mobile: {random_phone()}
Aadhaar: {random_aadhaar()}
PAN: {random_pan_real()}
GST: {random_gstin()}
IFSC: {random_ifsc()}
Voter ID: {random_voter_id()}
Bank Account: {random_bank_account()}
UPI: {random_upi()}
Driving Licence: {random_driving_licence()}
PIN Code: 400050
IP Address: 192.168.{random.randint(1,254)}.{random.randint(1,254)}
URL: https://mybank.sbi.co.in/netbanking/login?user=anjali123
Credit Card: 4532015112830366

--- BLOCK 3: CONTEXTUAL AMBIGUITY ---
Washington signed the Aadhaar form.
The pan caught fire before the PAN {random_pan_real()} was verified.
Call me at 9 AM, not 9876543210.
My birthday is 22/03 which is not the IFSC {random_ifsc()}.

--- BLOCK 4: HINDI MIXED ---
मेरा नाम Ravi Sharma है।
मेरा आधार नंबर {random_aadhaar()} है।
Contact: {random_phone()}
Email: {fake.email() if FAKER else 'ravi@example.com'}
पिन कोड: 302001

--- BLOCK 5: EDGE CASE NUMBERS ---
Invoice #432588129901 (should NOT be Aadhaar — no context)
My Aadhaar is {random_aadhaar()} (SHOULD be Aadhaar — has context keyword)
Order 9876543210 placed (should NOT be phone — looks like order number)
Mobile: 9876543210 (SHOULD be phone — has context keyword)
Amount: ₹45,000 transferred to account {random_bank_account()} via NEFT

--- BLOCK 6: ZERO PII (should return 0 entities) ---
The weather today is pleasant with a temperature of 28 degrees.
The meeting is scheduled for next Tuesday at 2 PM in Conference Room B.
Please review the quarterly business report before the board meeting.
The project deadline has been extended by two weeks as requested.

--- BLOCK 7: ONLY URLS AND IPs ---
Visit https://ciphera.in for more information.
The server IP is 10.0.0.1 and the gateway is 192.168.1.1.
API endpoint: https://api.ciphera.in/api/v3/analyze
Blocked IP: 185.220.101.47 (Tor exit node)
"""
    path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  {path.name}")


def make_5_batch_test_files():
    """Multiple small files for batch processing test."""
    for i in range(8):
        name  = fake.name()  if FAKER else f"Person {i+1}"
        email = fake.email() if FAKER else f"person{i+1}@test.com"
        content = f"""DOCUMENT {i+1:02d} — BATCH TEST FILE
Employee: {name}
Email: {email}
Aadhaar: {random_aadhaar()}
PAN: {random_pan_real()}
Account: {random_bank_account()}
IFSC: {random_ifsc()}
Phone: {random_phone()}
DOB: {random.randint(1,28):02d}/{random.randint(1,12):02d}/{random.randint(1970,2000)}
"""
        path = OUT / "5_txt_samples" / f"batch_file_{i+1:02d}.txt"
        path.write_text(content, encoding='utf-8')
    print(f"  [DONE]  batch_file_01.txt through batch_file_08.txt")


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    if not REPORTLAB or not FAKER:
        print("\nInstall missing dependencies first:")
        print("  pip install reportlab faker pillow")
        print("Then re-run this script.\n")

    print("\n Generating Ciphera test documents...\n")
    print("Category 1 — Format & Modality:")
    make_1a_clean_digital_pdf()
    make_1b_multipage_pdf()

    print("\nCategory 2 — Layout & Structure:")
    make_2a_dense_table_pdf()
    make_2b_two_column_pdf()
    make_2c_rotated_watermark_pdf()

    print("\nCategory 3 — PII & Entity Variations:")
    make_3a_standard_pii_txt()
    make_3b_indian_pii_txt()
    make_3c_contextual_ambiguity_txt()
    make_3d_hindi_mixed_txt()

    print("\nCategory 4 — Adversarial Edge Cases:")
    make_4a_hidden_text_pdf()
    make_4b_micro_text_pdf()
    make_4c_overlapping_layers_pdf()
    make_4d_pii_inside_image_note_txt()

    print("\nCategory 5 — Quick Paste Samples:")
    make_5_quick_test_samples()
    # make_5_batch_test_files() # Omitted batch files for cleaner workspace

    print(f"\n  All test documents generated in: ./{OUT}/")
