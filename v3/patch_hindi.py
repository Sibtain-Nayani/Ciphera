GENERIC_NLP_TYPES = {"PERSON", "ORGANIZATION", "LOCATION", "DATE_TIME", "O", "NRP"}

def merge_hindi_entities(
    candidates: list[HindiEntity],
    threshold: float = CONFIDENCE_THRESHOLD_HI,
) -> list[HindiEntity]:
    if not candidates:
        return []

    candidates.sort(key=lambda e: (e.start, -e.score))
    groups: list[list[HindiEntity]] = []
    cur = [candidates[0]]
    end = candidates[0].end

    for entity in candidates[1:]:
        if entity.start < end:
            cur.append(entity)
            end = max(end, entity.end)
        else:
            groups.append(cur)
            cur  = [entity]
            end  = entity.end
    groups.append(cur)

    merged: list[HindiEntity] = []
    for group in groups:
        locked = [e for e in group if e.source == DetectionSource.REGEX and e.score >= 0.80]
        if locked:
            elected_type = max(locked, key=lambda e: e.score).entity_type
        else:
            structured = [e for e in group if e.entity_type not in GENERIC_NLP_TYPES]
            if structured:
                tw: dict[str, float] = {}
                for e in structured:
                    w = SOURCE_WEIGHTS_HI.get(e.source, 1.0)
                    tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
                elected_type = max(tw, key=tw.__getitem__)
            else:
                tw: dict[str, float] = {}
                for e in group:
                    w = SOURCE_WEIGHTS_HI.get(e.source, 1.0)
                    tw[e.entity_type] = tw.get(e.entity_type, 0.0) + e.score * w
                elected_type = max(tw, key=tw.__getitem__)

        if elected_type not in GENERIC_NLP_TYPES:
            wscore = max(e.score for e in group)
        else:
            total_w = sum(SOURCE_WEIGHTS_HI.get(e.source, 1.0) for e in group)
            wscore  = sum(
                e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0) for e in group
            ) / total_w

        if wscore < threshold:
            continue

        matching = [e for e in group if e.entity_type == elected_type]
        best    = max(matching or group, key=lambda e: e.score * SOURCE_WEIGHTS_HI.get(e.source, 1.0))
        sources = list({e.source for e in group})
        merged.append(HindiEntity(
            start=best.start, end=best.end,
            entity_type=elected_type,
            text=best.text, score=min(wscore, 1.0),
            source=DetectionSource.MERGED if len(sources) > 1 else sources[0],
            context=best.context, merged_from=sources,
        ))

    return merged
