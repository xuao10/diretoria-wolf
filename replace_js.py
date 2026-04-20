import sys

# Read the original file
with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start and end of the JS block to replace
start_line = None
end_line = None

for i, line in enumerate(lines):
    if 'PRODUCTION DIRECTOR - GUARDI' in line or 'PRODUCTION DIRECTOR v2.0' in line:
        start_line = i
    if start_line and "return { init, stop, refreshAll };" in line:
        # Find the closing })(); after this
        for j in range(i, min(i+5, len(lines))):
            if '})();' in lines[j]:
                end_line = j + 1
                break
        break

if start_line is None or end_line is None:
    print(f"Could not find JS block (start={start_line}, end={end_line})")
    sys.exit(1)

print(f"Replacing lines {start_line+1} to {end_line} (0-indexed: {start_line}-{end_line-1})")

# Read new JS
with open('new_prod_js.js', 'r', encoding='utf-8') as f:
    new_js = f.read()

# Replace
new_lines = lines[:start_line] + [new_js + '\n'] + lines[end_line:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("Replacement complete!")
