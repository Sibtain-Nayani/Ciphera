import re

text = "A a d h a a r : 1 1 2 2   3 3 4 4   5 5 6 6"
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

dense_text = "".join(dense_chars)
print("dense_text:", repr(dense_text))

raw_pattern = r"([0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{4}[\s\-]?[0-9OoIiLl]{4})"
dense_pattern = re.compile(raw_pattern)

for m in dense_pattern.finditer(dense_text):
    print("Match:", m.group())
    dense_start = m.start()
    dense_end = m.end() - 1
    print("dense_start:", dense_start, "dense_end:", dense_end)
    orig_start = original_indices[dense_start]
    orig_end = original_indices[dense_end] + 1
    print("Original text:", repr(text[orig_start:orig_end]))
