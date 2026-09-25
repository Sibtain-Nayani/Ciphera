import re

with open("frontend/src/app/redact/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

old_ui = '<p className="text-[11px] text-gray-500 mt-1 font-mono">{exportProgress.current} / {exportProgress.total} pages</p>'
new_ui = '{exportProgress.total === 100 ? <p className="text-[11px] text-gray-500 mt-1 font-mono">{exportProgress.current}%</p> : <p className="text-[11px] text-gray-500 mt-1 font-mono">{exportProgress.current} / {exportProgress.total} pages</p>}'

content = content.replace(old_ui, new_ui)

with open("frontend/src/app/redact/page.tsx", "w", encoding="utf-8") as f:
    f.write(content)
print("Patched UI")
