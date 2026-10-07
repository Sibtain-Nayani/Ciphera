import os

with open("backend/feature1_pipeline_upgrade.py", "r", encoding="utf-8") as f:
    content = f.read()

old_cleaner = """class OCRCleaner:
    SUBS = [
        (re.compile(r'\\b0(?=[A-Z])'),   'O'),
        (re.compile(r'(?<=[A-Z])0\\b'),  'O'),
        (re.compile(r'\\bl(?=\\d)'),      '1'),
        (re.compile(r'(?<=\\d)l\\b'),     '1'),
        (re.compile(r'[''`]'),          "'"),
        (re.compile(r'[""z]'),          '"'),
        (re.compile(r'\\r\\n|\\r'),        '\\n'),
        (re.compile(r'[ \\t]{2,}'),      ' '),
    ]
    def clean(self, text: str) -> str:
        for p, r in self.SUBS:
            text = p.sub(r, text)
        return text.strip()"""

new_cleaner = """class OCRCleaner:
    SUBS = [
        (re.compile(r'\\b0(?=[A-Z])'),   'O'),
        (re.compile(r'(?<=[A-Z])0\\b'),  'O'),
        (re.compile(r'\\bl(?=\\d)'),      '1'),
        (re.compile(r'(?<=\\d)l\\b'),     '1'),
        (re.compile(r'[''`]'),          "'"),
        (re.compile(r'[""z]'),          '"'),
        (re.compile(r'\\r\\n|\\r'),        '\\n'),
        (re.compile(r'[ \\t]{2,}'),      ' '),
    ]
    
    DEVANAGARI_DIGITS = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
    }
    
    def clean(self, text: str) -> str:
        # Translate Devanagari numerals to ASCII digits
        text = ''.join(self.DEVANAGARI_DIGITS.get(char, char) for char in text)
        
        for p, r in self.SUBS:
            text = p.sub(r, text)
        return text.strip()"""

content = content.replace(old_cleaner, new_cleaner)

with open("backend/feature1_pipeline_upgrade.py", "w", encoding="utf-8") as f:
    f.write(content)
