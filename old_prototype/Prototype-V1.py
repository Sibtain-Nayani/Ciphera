# Presidio Anonymization Prototype
#
# This script creates a menu-driven command-line tool to anonymize
# text files using the Microsoft Presidio SDK.
#
# ---------------------------------------------------------------------
# --- PRE-REQUISITES ---
# 1. Install the required Python libraries:
#    pip install presidio-analyzer presidio-anonymizer "spacy>=3.0.0,<4.0.0"
#
# 2. Download the required SpaCy NLP model:
#    python -m spacy download en_core_web_lg
# ---------------------------------------------------------------------

import os
import sys
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

def anonymize_text(text: str, technique: str, analyzer: AnalyzerEngine, anonymizer: AnonymizerEngine) -> str:
    """
    Analyzes and anonymizes text based on the selected technique.
    """
    print("Analyzing text for PII...")
    # 1. Analyze the text for PII entities
    # We explicitly ask for common entities. You can add more.
    analyzer_results = analyzer.analyze(
        text=text,
        entities=["PERSON", "PHONE_NUMBER", "CREDIT_CARD", "EMAIL_ADDRESS", "LOCATION", "DATE_TIME"],
        language='en'
    )
    
    print(f"Found {len(analyzer_results)} PII entities to anonymize.")
    
    # 2. Define the anonymization operator based on the user's choice
    operators_config = {}
    if technique == 'redact':
        # "Redact" removes the PII completely.
        # e.g., "My name is John Doe" -> "My name is "
        operators_config = {"DEFAULT": OperatorConfig("redact")}
        
    elif technique == 'replace':
        # "Replace" uses the default placeholder (e.g., <PERSON>).
        # e.g., "My name is John Doe" -> "My name is <PERSON>"
        operators_config = {"DEFAULT": OperatorConfig("replace")}
        
    elif technique == 'mask':
        # We'll define "Mask" as replacing with a static string.
        # e.g., "My name is John Doe" -> "My name is **********"
        operators_config = {
            "DEFAULT": OperatorConfig("replace", {"new_value": "**********"})
        }
        
    elif technique == 'hash':
        # "Hash" replaces the PII with a SHA256 hash.
        # e.g., "My name is John Doe" -> "My name is 2c62a7a... (hash)"
        # This is useful for maintaining uniqueness while anonymizing.
        operators_config = {
            "DEFAULT": OperatorConfig("hash", {"hash_type": "sha256"})
        }

    # 3. Anonymize the text using the chosen operator
    print(f"Applying '{technique}' technique...")
    anonymized_result = anonymizer.anonymize(
        text=text,
        analyzer_results=analyzer_results,
        operators=operators_config
    )
    
    return anonymized_result.text

def process_file(technique: str, analyzer: AnalyzerEngine, anonymizer: AnonymizerEngine):
    """
    Handles the file I/O for reading, anonymizing, and writing files.
    """
    try:
        # Get input file path
        input_path = input("Enter the path to your input file (e.g., /path/to/data.txt): ").strip().strip("'\"")
        
        if not os.path.exists(input_path):
            print(f"\n[Error] Input file not found at: {input_path}")
            print("Please check the path and try again.\n")
            return

        # Get output file path
        default_output = os.path.splitext(input_path)[0] + f"_anonymized_{technique}.txt"
        output_path_str = input(f"Enter path for the new anonymized file (Press Enter for default: [{default_output}]): ").strip().strip("'\"")
        
        output_path = output_path_str or default_output

        # Check for overwrite
        if os.path.exists(output_path):
            overwrite = input(f"\n[Warning] File '{output_path}' already exists. Overwrite? (y/n): ").strip().lower()
            if overwrite != 'y':
                print("Operation cancelled.\n")
                return

        # Read, Anonymize, Write
        print(f"\nReading file from {'input_admin.py'}")
        with open(input_path, 'r', encoding='utf-8') as f:
            original_text = f.read()
        
        anonymized_text = anonymize_text(original_text, technique, analyzer, anonymizer)
        
        print(f"Writing anonymized file to {output_path}...")
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(anonymized_text)
        
        print("\n" + "="*40)
        print(f"Success! Anonymized file saved to: {output_path}")
        print("="*40 + "\n")

    except Exception as e:
        print(f"\n[Error] An unexpected error occurred: {e}\n")

def main_menu():
    """
    Displays the main menu and handles user choice.
    """
    # Initialize the Analyzer and Anonymizer engines once.
    # This is important as they load large NLP models.
    print("Initializing Presidio... (This may take a moment on first run)")
    try:
        analyzer = AnalyzerEngine()
        anonymizer = AnonymizerEngine()
        print("Initialization complete.\n")
    except Exception as e:
        print(f"\n[Fatal Error] Failed to initialize Presidio engines: {e}")
        print("Please ensure all dependencies are installed correctly:")
        print("1. pip install presidio-analyzer presidio-anonymizer 'spacy>=3.0.0,<4.0.0'")
        print("2. python -m spacy download en_core_web_lg")
        sys.exit(1)

    while True:
        print("--- Presidio Data Anonymization Prototype ---")
        print("Select an Anonymization Technique:")
        print("  1. Redact (Remove PII completely)")
        print("  2. Replace (Use placeholders like <PERSON>)")
        print("  3. Mask (Replace PII with '**********')")
        print("  4. Hash (Replace PII with a SHA256 hash)")
        print("  5. Exit")
        
        choice = input("Enter your choice (1-5): ").strip()
        
        if choice == '1':
            process_file('redact', analyzer, anonymizer)
        elif choice == '2':
            process_file('replace', analyzer, anonymizer)
        elif choice == '3':
            process_file('mask', analyzer, anonymizer)
        elif choice == '4':
            process_file('hash', analyzer, anonymizer)
        elif choice == '5':
            print("Exiting. Goodbye!")
            break
        else:
            print("\n[Error] Invalid choice. Please enter a number between 1 and 5.\n")

if __name__ == "__main__":
    main_menu()
