from fastapi import HTTPException
from app.services.document_parser import DocumentParser
from app.services.detection_engine import DetectionEngine

class VerificationEngine:
    """
    Phase 7: Verification Engine
    Runs the redacted file back through the detection pipeline to ensure no sensitive data leaked.
    """
    
    @staticmethod
    def verify_redacted_file(file_bytes: bytes, filename: str) -> bool:
        # Parse the redacted file
        canonical_doc = DocumentParser.parse(file_bytes, filename)
        
        # Run detection
        entities = DetectionEngine.run_detection(canonical_doc, threshold=0.5)
        
        # In a real system we would check if these entities were SUPPOSED to be redacted
        # and if they leaked. For now, if we detect ANY high-confidence entities in a fully redacted doc,
        # we flag it (unless they are explicitly allowed).
        # We will just return False if it finds anything > 0.85
        leaked = [e for e in entities if e.score > 0.85]
        
        if leaked:
            # We found something that looks like sensitive data in the output file!
            raise HTTPException(
                status_code=500, 
                detail=f"Verification failed: {len(leaked)} entities detected post-redaction. Data leak prevented."
            )
            
        return True
