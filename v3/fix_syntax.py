with open('backend/app/services/document_parser.py', 'r') as f:
    content = f.read()
content = content.replace('full_text += "\n"', 'full_text += "\\n"')
content = content.replace('line_text += "\n"', 'line_text += "\\n"')
with open('backend/app/services/document_parser.py', 'w') as f:
    f.write(content)
