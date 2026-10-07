import os

file_path = "backend/app/services/detection_engine.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

import_target = "from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox"
import_replacement = """from app.schemas.document import CanonicalDocument, RedactionEntity, BoundingBox
from app.services.columnar_inference import ColumnarInferenceEngine"""

if import_target in content:
    content = content.replace(import_target, import_replacement)

return_target = "        return redactions"
return_replacement = """        
        # 3. Apply Columnar Inference to catch missed tabular records
        redactions = ColumnarInferenceEngine.run_inference(doc, redactions)
        
        return redactions"""

if return_target in content:
    content = content.replace(return_target, return_replacement)
    
with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched DetectionEngine to include ColumnarInferenceEngine.")
