GENERIC_NLP_TYPES = {"PERSON", "ORGANIZATION", "LOCATION", "DATE_TIME", "O", "NRP"}

def merge_and_vote(
    candidates: list[DetectedEntity],
    threshold: float = CONFIDENCE_THRESHOLD,
) -> list[DetectedEntity]:
    if not candidates:
        return []

    candidates.sort(key=lambda e: (e.start, -e.score))
    groups: list[list[DetectedEntity]] = []
    cur = [candidates[0]]
    end = candidates[0].end

    for entity in candidates[1:]:
        if entity.start < end:
            cur.append(entity)
            end = max(end, entity.end)
        else:
            groups.append(cur)
            cur = [entity]
            end = entity.end
    groups.append(cur)

    # Scaling ratio for type floors based on user threshold vs default
    ratio = threshold / CONFIDENCE_THRESHOLD if CONFIDENCE_THRESHOLD > 0 else 1.0

    merged = []
    for group in groups:
        locked = [e for e in group if e.type_locked]
        if locked:
            elected_type = max(locked, key=lambda e: e.score).entity_type
        else:
            # ── Phase 3: CANDIDATE CONFLICT RESOLUTION ──
            # If a structured deterministic entity exists, it suppresses generic NLP labels.
            structured = [e for e in group if e.entity_type not in GENERIC_NLP_TYPES]
            
            if structured:
                # Vote ONLY among structured candidates
                tw: dict[str, float] = {}
                for e in structured:
                    w = SOURCE_WEIGHTS.get(e.source.value, 1.0)
                    tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
                elected_type = max(tw, key=tw.__getitem__)
            else:
                # Vote among NLP candidates
                tw: dict[str, float] = {}
                for e in group:
                    w = SOURCE_WEIGHTS.get(e.source.value, 1.0)
                    tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
                elected_type = max(tw, key=tw.__getitem__)

        # ── SCORING WITH OVERLAPPING EVIDENCE ──
        if elected_type not in GENERIC_NLP_TYPES:
            # If we elected a structured type, treat generic NLP candidates as supporting evidence.
            # Take the max score in the group so strong NLP confidence boosts the structured candidate.
            wscore = max(e.score for e in group)
        else:
            # Traditional weighted average for generic NLP to prevent weak candidates from surviving
            total_w = sum(SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group)
            wscore  = sum(
                e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0) for e in group
            ) / total_w

        # Check against requested threshold
        if wscore < threshold:
            continue

        # Scale floor dynamically with sensitivity
        base_floor = TYPE_FLOOR.get(elected_type, CONFIDENCE_THRESHOLD)
        effective_floor = min(base_floor * ratio, base_floor) if ratio < 1.0 else max(base_floor, threshold)
        if wscore < min(threshold, effective_floor):
            continue

        # Pick best span from candidates matching the elected type
        matching = [e for e in group if e.entity_type == elected_type]
        best     = max(matching or group, key=lambda e: e.score * SOURCE_WEIGHTS.get(e.source.value, 1.0))
        sources  = list({e.source for e in group})
        merged.append(DetectedEntity(
            start=best.start, end=best.end,
            entity_type=elected_type, text=best.text,
            score=min(wscore, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))
    return merged
