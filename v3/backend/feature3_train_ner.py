"""
Ciphera V3 — Feature 3: Synthetic Dataset + NER Training
===========================================================
Generates a labeled Indian PII dataset and fine-tunes a spaCy NER model.

Steps:
  1. Generate synthetic documents with Faker (Indian locale)
  2. Label entities automatically (known positions from generation)
  3. Train a spaCy NER model on the labeled data
  4. Save model to v3/backend/models/ciphera_ner/

Install:
    pip install faker spacy
    python -m spacy download en_core_web_lg

Run:
    python feature3_train_ner.py
    (takes ~10-20 min on CPU for 5000 examples)

After training, update DetectionPipeline in feature1 to load:
    spacy.load("v3/backend/models/ciphera_ner")
"""

from __future__ import annotations

import random
import json
import re
from pathlib import Path
from datetime import date, timedelta

import spacy
from spacy.tokens import DocBin
from spacy.training import Example
from faker import Faker

fake = Faker("en_IN")
random.seed(42)

OUTPUT_DIR = Path("models/ciphera_ner")
TRAIN_FILE  = Path("data/train.spacy")
DEV_FILE    = Path("data/dev.spacy")

TRAIN_EXAMPLES = 5000
DEV_EXAMPLES   = 500


# ---------------------------------------------------------------------------
# Indian PII generators
# ---------------------------------------------------------------------------

def gen_aadhaar() -> str:
    """Generate a fake 12-digit Aadhaar (not real, not Verhoeff-valid)."""
    return " ".join([
        str(random.randint(2000, 9999)),
        str(random.randint(1000, 9999)),
        str(random.randint(1000, 9999)),
    ])


def gen_pan() -> str:
    import string
    letters = string.ascii_uppercase
    return (
        "".join(random.choices(letters, k=5))
        + str(random.randint(1000, 9999))
        + random.choice(letters)
    )


def gen_gst() -> str:
    import string
    state = str(random.randint(1, 35)).zfill(2)
    pan   = gen_pan()
    extra = random.choice("123456789") + random.choice(string.ascii_uppercase + "123456789") + "Z"
    check = random.choice(string.digits + string.ascii_uppercase)
    return f"{state}{pan}{extra}{check}"


def gen_ifsc() -> str:
    banks = ["SBIN", "HDFC", "ICIC", "AXIS", "PUNB", "UBIN", "CORP", "BKID"]
    bank  = random.choice(banks)
    branch = "".join([str(random.randint(0, 9)) for _ in range(6)])
    return f"{bank}0{branch}"


def gen_dob() -> str:
    start = date(1950, 1, 1)
    delta = date(2005, 12, 31) - start
    dob   = start + timedelta(days=random.randint(0, delta.days))

    formats = [
        dob.strftime("%d/%m/%Y"),
        dob.strftime("%d-%m-%Y"),
        dob.strftime("%d.%m.%Y"),
        dob.strftime("%Y-%m-%d"),
        dob.strftime("%d %B %Y"),
        dob.strftime("%B %d, %Y"),
        dob.strftime("%-d %b %Y") if hasattr(dob, 'strftime') else dob.strftime("%d %b %Y"),
    ]
    return random.choice(formats)


def gen_phone() -> str:
    prefix = random.choice(["6", "7", "8", "9"])
    number = prefix + "".join([str(random.randint(0, 9)) for _ in range(9)])
    formats = [
        number,
        f"+91 {number[:5]} {number[5:]}",
        f"+91-{number}",
        f"0{number}",
    ]
    return random.choice(formats)


def gen_voter_id() -> str:
    import string
    letters = string.ascii_uppercase
    return (
        "".join(random.choices(letters, k=3))
        + str(random.randint(1000000, 9999999))
    )


# ---------------------------------------------------------------------------
# Document templates with entity injection
# ---------------------------------------------------------------------------

TEMPLATES = [
    # KYC form
    lambda: _build(
        "KYC Form\nName: {name}\nDate of Birth: {dob}\nAadhaar: {aadhaar}\nPAN: {pan}\nPhone: {phone}\nEmail: {email}",
        name=fake.name(), dob=gen_dob(), aadhaar=gen_aadhaar(),
        pan=gen_pan(), phone=gen_phone(), email=fake.email(),
    ),
    # Bank application
    lambda: _build(
        "Bank Account Application\nApplicant: {name}\nDOB: {dob}\nMobile: {phone}\nPAN Number: {pan}\nIFSC: {ifsc}\nEmail ID: {email}",
        name=fake.name(), dob=gen_dob(), phone=gen_phone(),
        pan=gen_pan(), ifsc=gen_ifsc(), email=fake.email(),
    ),
    # GST invoice
    lambda: _build(
        "Tax Invoice\nBill To: {name}\nGSTIN: {gst}\nPAN: {pan}\nContact: {phone}\nEmail: {email}\nDate: {dob}",
        name=fake.name(), gst=gen_gst(), pan=gen_pan(),
        phone=gen_phone(), email=fake.email(), dob=gen_dob(),
    ),
    # Voter registration
    lambda: _build(
        "Voter ID Application\nFull Name: {name}\nVoter ID: {voter_id}\nDate of Birth: {dob}\nPhone: {phone}",
        name=fake.name(), voter_id=gen_voter_id(),
        dob=gen_dob(), phone=gen_phone(),
    ),
    # General profile
    lambda: _build(
        "Employee Profile\nEmployee Name: {name}\nDate of Birth: {dob}\nAadhaar No: {aadhaar}\nPAN: {pan}\nPhone: {phone}\nEmail: {email}\nIFSC: {ifsc}",
        name=fake.name(), dob=gen_dob(), aadhaar=gen_aadhaar(),
        pan=gen_pan(), phone=gen_phone(), email=fake.email(), ifsc=gen_ifsc(),
    ),
]

# Maps template variable name → entity label
FIELD_TO_LABEL: dict[str, str] = {
    "name":     "PERSON",
    "dob":      "DATE_OF_BIRTH",
    "aadhaar":  "AADHAAR_NUMBER",
    "pan":      "PAN_NUMBER",
    "gst":      "GST_NUMBER",
    "ifsc":     "IFSC_CODE",
    "phone":    "PHONE_NUMBER",
    "email":    "EMAIL_ADDRESS",
    "voter_id": "VOTER_ID",
}


def _build(template: str, **kwargs) -> tuple[str, list[tuple[int, int, str]]]:
    """
    Fill template with values, record exact char spans for each entity.
    Returns (text, [(start, end, label), ...])
    """
    text = template
    entities = []

    for key, value in kwargs.items():
        label = FIELD_TO_LABEL.get(key)
        if label is None:
            text = text.replace(f"{{{key}}}", value)
            continue

        idx = text.find(f"{{{key}}}")
        if idx == -1:
            continue

        text = text.replace(f"{{{key}}}", value, 1)
        entities.append((idx, idx + len(value), label))

    return text, entities


# ---------------------------------------------------------------------------
# Dataset generation
# ---------------------------------------------------------------------------

def generate_dataset(n: int) -> list[tuple[str, list[tuple[int, int, str]]]]:
    dataset = []
    for _ in range(n):
        template_fn = random.choice(TEMPLATES)
        text, entities = template_fn()
        # Basic span validation
        valid_entities = [
            (s, e, l) for s, e, l in entities
            if s >= 0 and e <= len(text) and s < e
        ]
        dataset.append((text, valid_entities))
    return dataset


# ---------------------------------------------------------------------------
# spaCy DocBin builder
# ---------------------------------------------------------------------------

def build_docbin(
    nlp: spacy.Language,
    data: list[tuple[str, list[tuple[int, int, str]]]],
) -> DocBin:
    db = DocBin()
    skipped = 0

    for text, entities in data:
        doc = nlp.make_doc(text)
        ents = []
        for start, end, label in entities:
            span = doc.char_span(start, end, label=label, alignment_mode="contract")
            if span is None:
                skipped += 1
                continue
            ents.append(span)

        # Remove overlapping spans
        try:
            doc.ents = spacy.util.filter_spans(ents)
        except Exception:
            skipped += 1
            continue
        db.add(doc)

    print(f"Built DocBin: {len(data)} examples, {skipped} spans skipped")
    return db


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def train(
    train_data: list[tuple[str, list[tuple[int, int, str]]]],
    dev_data:   list[tuple[str, list[tuple[int, int, str]]]],
    output_dir: Path,
    n_iter:     int = 30,
    base_model: str = "en_core_web_lg",
):
    """Fine-tune NER on top of base_model."""
    output_dir.mkdir(parents=True, exist_ok=True)
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    print(f"Loading base model: {base_model}")
    nlp = spacy.load(base_model)

    # Add NER pipe if not present
    if "ner" not in nlp.pipe_names:
        ner = nlp.add_pipe("ner", last=True)
    else:
        ner = nlp.get_pipe("ner")

    # Add new labels
    new_labels = {
        "AADHAAR_NUMBER", "PAN_NUMBER", "GST_NUMBER", "IFSC_CODE",
        "VOTER_ID", "IN_PASSPORT", "DATE_OF_BIRTH", "PHONE_NUMBER",
        "EMAIL_ADDRESS", "PERSON",
    }
    for label in new_labels:
        ner.add_label(label)

    # Build DocBins
    print("Building training data...")
    train_db = build_docbin(nlp, train_data)
    dev_db   = build_docbin(nlp, dev_data)
    train_db.to_disk(TRAIN_FILE)
    dev_db.to_disk(DEV_FILE)
    print(f"Saved train→{TRAIN_FILE}, dev→{DEV_FILE}")

    # Convert to Examples
    train_examples = []
    for text, entities in train_data:
        doc = nlp.make_doc(text)
        example = Example.from_dict(doc, {"entities": [
            (s, e, l) for s, e, l in entities
        ]})
        train_examples.append(example)

    # Initialize
    nlp.initialize(lambda: train_examples)

    # Training loop
    other_pipes = [p for p in nlp.pipe_names if p != "ner"]
    print(f"Training for {n_iter} iterations (disabling: {other_pipes})")

    best_f1 = 0.0
    with nlp.disable_pipes(*other_pipes):
        optimizer = nlp.create_optimizer()
        for i in range(n_iter):
            random.shuffle(train_examples)
            losses: dict = {}
            batches = spacy.util.minibatch(train_examples, size=16)
            for batch in batches:
                nlp.update(batch, drop=0.3, losses=losses, sgd=optimizer)

            # Evaluate on dev
            dev_examples = []
            for text, entities in dev_data[:100]:  # quick eval on 100 samples
                doc = nlp.make_doc(text)
                ex  = Example.from_dict(doc, {"entities": [(s, e, l) for s, e, l in entities]})
                dev_examples.append(ex)

            scores = nlp.evaluate(dev_examples)
            f1 = scores.get("ents_f", 0.0)
            print(f"Iter {i+1:02d} | loss={losses.get('ner', 0):.2f} | F1={f1:.3f}")

            if f1 > best_f1:
                best_f1 = f1
                nlp.to_disk(output_dir)
                print(f"  → Saved best model (F1={f1:.3f})")

    print(f"\nTraining complete. Best F1: {best_f1:.3f}")
    print(f"Model saved to: {output_dir}")
    return nlp


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def evaluate(model_path: Path, test_data: list):
    """Quick evaluation of saved model."""
    nlp = spacy.load(model_path)
    examples = []
    for text, entities in test_data:
        doc = nlp.make_doc(text)
        ex  = Example.from_dict(doc, {"entities": [(s, e, l) for s, e, l in entities]})
        examples.append(ex)
    scores = nlp.evaluate(examples)
    print("\n── Evaluation Results ──")
    print(f"Precision : {scores.get('ents_p', 0):.3f}")
    print(f"Recall    : {scores.get('ents_r', 0):.3f}")
    print(f"F1        : {scores.get('ents_f', 0):.3f}")
    per_type = scores.get("ents_per_type", {})
    if per_type:
        print("\nPer entity type:")
        for etype, s in sorted(per_type.items()):
            print(f"  {etype:<20} P={s['p']:.3f}  R={s['r']:.3f}  F={s['f']:.3f}")
    return scores


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"Generating {TRAIN_EXAMPLES} training examples...")
    train_data = generate_dataset(TRAIN_EXAMPLES)

    print(f"Generating {DEV_EXAMPLES} dev examples...")
    dev_data = generate_dataset(DEV_EXAMPLES)

    print(f"Generating 200 test examples...")
    test_data = generate_dataset(200)

    # Train
    train(
        train_data=train_data,
        dev_data=dev_data,
        output_dir=OUTPUT_DIR,
        n_iter=30,
        base_model="en_core_web_lg",
    )

    # Final evaluation
    if OUTPUT_DIR.exists():
        evaluate(OUTPUT_DIR, test_data)

    print("\nDone. To use this model in the pipeline:")
    print(f'  nlp = spacy.load("{OUTPUT_DIR}")')
