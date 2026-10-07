import sys, re
text = 'A list of unrelated numbers: 9 8 7 6 5 4 3 2 1 0. And a table: Price 4 5 3 2 Qty 8 8 1 2 Total 9 9 0 1. Also: P.A.N. is A B C D E 1 2 3 4 F.'

dense_chars = []
original_indices = []
last_non_space = -1
for i, c in enumerate(text):
    if not c.isspace():
        if last_non_space != -1:
            gap = text[last_non_space+1:i]
            if '\n' in gap or len(gap) > 3:
                dense_chars.append(' ')
                original_indices.append(i)
        dense_chars.append(c)
        original_indices.append(i)
        last_non_space = i

dense_text = ''.join(dense_chars)
print('Dense text:', dense_text)

raw_pattern = r'[A-Z]{5}[0-9]{4}[A-Z]'
dense_pattern = re.compile(raw_pattern)
for m in dense_pattern.finditer(dense_text):
    raw_dense = m.group()
    dense_start = m.start()
    dense_end = m.end() - 1
    orig_start = original_indices[dense_start]
    orig_end = original_indices[dense_end] + 1
    raw_orig = text[orig_start:orig_end]
    
    tokens = raw_orig.split()
    is_highly_fragmented = len(tokens) >= (len(raw_dense) / 2)
    ctx = text[max(0, orig_start-40): min(len(text), orig_end+40)].lower()
    has_ctx = any(kw in ctx for kw in ['pan', 'permanent account'])
    
    print(f'Match: {raw_orig}')
    print(f'Tokens: {len(tokens)}, Highly frag: {is_highly_fragmented}, Has ctx: {has_ctx}')
