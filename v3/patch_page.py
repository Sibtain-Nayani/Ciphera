with open('frontend/src/app/redact/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: mapping backendEntities to shapes
old_map_shapes = """                const shapes = filteredEntities.filter(e => e.bbox && e.page_num === currentPage).map((e) => {
                    return {
                        id: e.id,
                        ruleType: e.entity_type.toLowerCase() as RuleType,
                        type: 'blackout' as const,
                        x: e.bbox!.x0,
                        y: e.bbox!.y0,
                        width: e.bbox!.x1 - e.bbox!.x0,
                        height: e.bbox!.y1 - e.bbox!.y0,
                    };
                });"""

new_map_shapes = """                const scale = fileType === 'pdf' ? 2.0 : 1.0;
                const shapes = filteredEntities.filter(e => e.bbox && e.page_num === currentPage).map((e) => {
                    return {
                        id: e.id,
                        ruleType: e.entity_type.toLowerCase() as RuleType,
                        type: 'blackout' as const,
                        x: e.bbox!.x0 * scale,
                        y: e.bbox!.y0 * scale,
                        width: (e.bbox!.x1 - e.bbox!.x0) * scale,
                        height: (e.bbox!.y1 - e.bbox!.y0) * scale,
                    };
                });"""

if old_map_shapes in content:
    content = content.replace(old_map_shapes, new_map_shapes)
else:
    print('Failed to find old_map_shapes')

# Fix 2: mapping shapes back to currentPageEntities
old_map_entities = """                const currentPageEntities = shapes.map(s => ({
                    id: s.id,
                    entity_type: s.ruleType ? s.ruleType.toUpperCase() : 'CUSTOM',
                    text: "",
                    score: 1.0,
                    page_num: currentPage,
                    bbox: { x0: s.x, y0: s.y, x1: s.x + s.width, y1: s.y + s.height },
                    status: "accepted"
                }));"""

new_map_entities = """                const scale = fileType === 'pdf' ? 2.0 : 1.0;
                const currentPageEntities = shapes.map(s => ({
                    id: s.id,
                    entity_type: s.ruleType ? s.ruleType.toUpperCase() : 'CUSTOM',
                    text: "",
                    score: 1.0,
                    page_num: currentPage,
                    bbox: { x0: s.x / scale, y0: s.y / scale, x1: (s.x + s.width) / scale, y1: (s.y + s.height) / scale },
                    status: "accepted"
                }));"""

if old_map_entities in content:
    content = content.replace(old_map_entities, new_map_entities)
else:
    print('Failed to find old_map_entities')

# Fix 3: status toUpperCase
old_status_check = "if (status === 'COMPLETED')"
new_status_check = "if (status.toUpperCase() === 'COMPLETED')"

if old_status_check in content:
    content = content.replace(old_status_check, new_status_check)
else:
    print('Failed to find old_status_check')

with open('frontend/src/app/redact/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
