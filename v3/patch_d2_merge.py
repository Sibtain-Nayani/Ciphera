import os

path = r'backend/feature12_hindi_support.py'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

replacement = """        deduped: list[dict] = []
        rightmost_end = -1
        rightmost_idx = -1   # index into deduped of the entity that set rightmost_end

        GENERIC_NLP_TYPES = {"PERSON", "ORGANIZATION", "LOCATION", "DATE_TIME", "O", "NRP"}

        for entity in combined:
            if entity["start"] >= rightmost_end:
                # No overlap — always keep
                deduped.append(entity)
                if entity["end"] > rightmost_end:
                    rightmost_end = entity["end"]
                    rightmost_idx = len(deduped) - 1
            else:
                # Overlap with a previous entity
                overlapping = deduped[rightmost_idx]
                
                is_new_structured = entity["entity_type"] not in GENERIC_NLP_TYPES
                is_old_structured = overlapping["entity_type"] not in GENERIC_NLP_TYPES
                
                if is_new_structured and not is_old_structured:
                    # Replace the generic entity with the structured one regardless of score
                    deduped[rightmost_idx] = entity
                    rightmost_end = max(rightmost_end, entity["end"])
                elif is_old_structured and not is_new_structured:
                    # Discard the new generic entity regardless of score
                    pass
                elif entity["score"] > overlapping["score"] + 0.05:
                    # Both structured or both generic, or tied structure. Replace the lower-confidence entity.
                    deduped[rightmost_idx] = entity
                    rightmost_end = max(rightmost_end, entity["end"])
                # Otherwise discard the new entity — existing one wins"""

# Replace the specific block
code = code.replace("""        deduped: list[dict] = []
        rightmost_end = -1
        rightmost_idx = -1   # index into deduped of the entity that set rightmost_end

        for entity in combined:
            if entity["start"] >= rightmost_end:
                # No overlap — always keep
                deduped.append(entity)
                if entity["end"] > rightmost_end:
                    rightmost_end = entity["end"]
                    rightmost_idx = len(deduped) - 1
            else:
                # Overlap with a previous entity
                # Check if this entity is strictly higher confidence
                overlapping = deduped[rightmost_idx]
                if entity["score"] > overlapping["score"] + 0.05:
                    # Replace the lower-confidence entity
                    deduped[rightmost_idx] = entity
                    # Update rightmost_end if needed
                    rightmost_end = max(rightmost_end, entity["end"])
                # Otherwise discard the new entity — existing one wins""", replacement)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Patched merge_english_and_hindi")
