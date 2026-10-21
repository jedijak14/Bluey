"""Bounded public dependency/build diagnostics; never contains provider credentials."""
from pathlib import Path
path=Path('engine-bundle.log')
text=path.read_text(errors='replace')[-8000:] if path.exists() else 'No engine build log produced.'
for start in range(0,len(text),2000):
    part=text[start:start+2000]
    print('::error::Engine diagnostics '+str(start//2000+1)+': '+part.replace('%','%25').replace('\r','%0D').replace('\n','%0A'))
