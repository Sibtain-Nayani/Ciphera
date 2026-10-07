import re

with open("backend/feature1_pipeline_upgrade.py", "r", encoding="utf-8") as f:
    content = f.read()

new_method = """    DEVANAGARI_DIGITS = {
        '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
        '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
    }
    
    def clean(self, text: str) -> str:
        text = ''.join(self.DEVANAGARI_DIGITS.get(char, char) for char in text)
        for p, r in self.SUBS:
            text = p.sub(r, text)
        return text.strip()"""

content = re.sub(r'    def clean\(self, text: str\) -> str:\n        for p, r in self\.SUBS:\n            text = p\.sub\(r, text\)\n        return text\.strip\(\)', new_method, content)

with open("backend/feature1_pipeline_upgrade.py", "w", encoding="utf-8") as f:
    f.write(content)
