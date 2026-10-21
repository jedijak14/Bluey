"""Bounded public dependency/build diagnostics; never contains provider credentials."""
from pathlib import Path
path=Path('engine-bundle.log')
text=path.read_text(errors='replace')[-5500:] if path.exists() else 'No engine build log produced.'
print('::error::'+text.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
