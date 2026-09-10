
import json
from pathlib import Path
from ux_audit import check_directory
issues = check_directory(Path('../../../../.'))
with open('../../../../ux_audit_full.json', 'w', encoding='utf-8') as f:
    json.dump(issues, f)

