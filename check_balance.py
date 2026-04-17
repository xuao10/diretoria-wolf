import sys

with open('index.html', encoding='utf-8') as f:
    lines = f.readlines()

def check_balance(lines, start_idx, end_idx):
    balance = 0
    for i in range(start_idx, end_idx):
        balance += lines[i].count('<div')
        balance -= lines[i].count('</div')
    return balance

start_auditor = -1
start_producao = -1

for i, line in enumerate(lines):
    if 'id="view-auditor"' in line:
        start_auditor = i
    if 'id="view-producao"' in line:
        start_producao = i

if start_auditor != -1 and start_producao != -1:
    print(f'Auditor starts at {start_auditor}')
    print(f'Producao starts at {start_producao}')
    balance = check_balance(lines, start_auditor, start_producao)
    print(f'Balance between them: {balance} (if > 0, producao is nested in auditor)')
else:
    print('Could not find one of the views')
