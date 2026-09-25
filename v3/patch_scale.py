with open('frontend/src/app/redact/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('convertPdfToImages(file, 2.0)', 'convertPdfToImages(file, 3.0)')
content = content.replace("fileType === 'pdf' ? 2.0 : 1.0", "fileType === 'pdf' ? 3.0 : 1.0")

with open('frontend/src/app/redact/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
