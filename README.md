# **Ciphera — PII Anonymizer Streamlit App**

**Ciphera** is a web-based, interactive tool designed for data anonymization. Built with Streamlit and Microsoft's Presidio SDK, it allows users to upload or paste text and apply various techniques to detect and anonymize Personally Identifiable Information (PII).

This application provides a user-friendly interface to make Presidio's powerful PII detection (Analyzer) and anonymization (Anonymizer) capabilities accessible for prototypes, audits, and simple file-scrubbing tasks.

## **Features**

* **Multiple Anonymization Techniques:**  
  * **Redact:** Completely removes the PII (e.g., John Doe \-\> ).  
  * **Replace:** Replaces PII with a custom placeholder (e.g., John Doe \-\> \<REDACTED\>).  
  * **Mask:** Replaces PII with a fixed mask (e.g., John Doe \-\> \*\*\*\*\*\*\*\*).  
  * **Hash:** Replaces PII with a non-reversible SHA256 hash (e.g., John Doe \-\> a665a...).  
* **Selective PII Detection:** Users can select which PII entities to detect (e.g., PERSON, PHONE\_NUMBER, CREDIT\_CARD, LOCATION, etc.).  
* **Multiple Input Methods:**  
  * Paste raw text directly into a text area.  
  * Upload single or multiple .txt files for batch processing.  
* **Interactive Preview:** Displays a side-by-side comparison of the original text (with PII highlighted) and the anonymized text.  
* **Audit Trail:** Generates a detailed audit log showing the original PII, its anonymized value, the entity type, and the file it came from.  
* **Downloadable Artifacts:**  
  * Download the anonymized text as a new .txt file.  
  * Download the audit log as a .csv file for compliance and record-keeping.

## **Tech Stack**

* **Frontend:** [Streamlit](https://streamlit.io/)  
* **PII Engine:** [Microsoft Presidio](https://microsoft.github.io/presidio/) (Analyzer & Anonymizer)  
* **Data Handling:** [Pandas](https://pandas.pydata.org/)  
* **Language:** [Python](https://www.python.org/)

## **Setup and Installation**

To run this application on your local machine, follow these steps.

**1\. Prerequisites:**

* Python 3.8+  
* pip (Python package installer)

2\. Clone/Download:  
Get the app.py file and any sample text files (sample1.txt, sample2.txt) and place them in a project directory.  
3\. Install Dependencies:  
You will need to install Streamlit, Presidio, and SpaCy. Presidio requires a SpaCy NLP model to function.  
\# Install required Python libraries  
pip install streamlit pandas presidio-analyzer presidio-anonymizer "spacy\>=3.0.0,\<4.0.0"

\# Download the SpaCy model required by Presidio  
python \-m spacy download en\_core\_web\_lg

*(Note: en\_core\_web\_lg is a large model; en\_core\_web\_trf is more accurate but larger, and en\_core\_web\_md is a smaller alternative if space is a concern, though it may be less accurate.)*

4\. Run the Application:  
Open your terminal in the project directory and run:  
streamlit run app.py

Streamlit will start a local web server, and the application will open in your default web browser.

## **How to Use**

1. **Select Anonymization Settings (Sidebar):**  
   * **Technique:** Choose from "Redact", "Replace", "Mask", or "Hash".  
   * **Replacement Token:** If you selected "Replace", provide the text you want to use (e.g., \[CONFIDENTIAL\]).  
   * **Entities:** Select the types of PII you want the app to find.  
   * **Confidence:** Adjust the slider to set the minimum confidence level for detection (higher values mean fewer, but more certain, results).  
2. **Provide Input Text:**  
   * **Option A:** Paste your text directly into the "Or paste text here" box.  
   * **Option B:** Use the "Upload text file(s)" button to select one or more .txt files.  
3. **Run Anonymization:**  
   * Click the **"Run Anonymization"** button.  
4. **Review Results:**  
   * The app will process the inputs and display a preview for each file under the "Run" button.  
   * Each preview shows a **side-by-side diff** of the original (with PII highlighted) and the anonymized text.  
   * You can download the anonymized text for each file individually.  
5. **Check Audit Log:**  
   * Scroll down to the **"Audit / Logs"** section.  
   * A table will show every piece of PII that was detected and its anonymized counterpart.  
   * You can download the complete audit trail for your session as a single CSV file.

## **Security & Privacy Note**

This tool is a prototype. When handling real, sensitive data:

* **Audit Logs:** The generated audit CSVs link original PII to anonymized values. **These logs are themselves sensitive** and must be stored securely and in accordance with your organization's data privacy policy.  
* **Hashing:** Hashing is not encryption. If two identical PII values exist (e.g., the same phone number), they will produce the same hash. This is useful for maintaining data relationships but is not a secure way to store the original data.