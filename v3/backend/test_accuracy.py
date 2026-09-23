import sys
import os

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from feature1_pipeline_upgrade import DetectionPipeline, RegexStage, CONFIDENCE_THRESHOLD
from feature12_hindi_support import HindiPipeline, HindiRegexStage

def test_pipeline():
    print("==================================================")
    print("   CIPHERA V3 REDACTION ACCURACY TEST SUITE       ")
    print("==================================================")
    regex_stage = RegexStage()
    
    test_texts = [
        "Applicant Date of Birth : 03.12.2005 in Sangli",
        "DOB: 15/08/1992, Father's Name: Ramesh Kumar",
        "Resident of SANGLI 416416 Maharashtra",
        "Permanent Address: Flat 402, Lotus Enclave, Pune 411001",
        "Contact: +91 9876543210 or email test.user@example.com",
        "PAN: ABCDE1234F, Aadhaar: 2345 6789 0123",
        "जन्म तिथि: 03.12.2005 पता: सांगली 416416",
    ]
    
    print("\n--- 1. Testing Regex Stage ---")
    for t in test_texts:
        print(f"\nInput: '{t}'")
        entities = regex_stage.analyze(t)
        for e in entities:
            print(f"  [Regex] {e.entity_type} -> '{e.text}' (score: {e.score:.2f})")

    print("\n--- 2. Testing Detection Pipeline Threshold Sensitivity ---")
    pipeline = DetectionPipeline()
    
    sample_eval = "DOB: 03.12.2005, SANGLI 416416, PAN: ABCDE1234F"
    print(f"Sample: '{sample_eval}'")
    for thresh in [0.30, 0.50, 0.75]:
        print(f"\n>> Sensitivity Threshold: {thresh}")
        results = pipeline.run(sample_eval, threshold=thresh)
        for r in results:
            print(f"  [{r.entity_type}] '{r.text}' score={r.score:.2f}")

    print("\n--- 3. Testing Devanagari / Hindi Regex Extraction ---")
    hi_regex = HindiRegexStage()
    hi_sample = "नाम: राहुल वर्मा, जन्म तिथि: 12/05/1995, आधार: 9876 5432 1098, मोबाइल: 9876543210"
    print(f"Sample: '{hi_sample}'")
    hi_entities = hi_regex.analyse(hi_sample)
    for e in hi_entities:
        print(f"  [Hindi Regex] {e.entity_type} -> '{e.text}' (score: {e.score:.2f})")

    print("\n==================================================")
    print("   ALL TESTS EXECUTED SUCCESSFULLY                ")
    print("==================================================")

if __name__ == "__main__":
    test_pipeline()
