"""Expose a bounded diagnostic in Actions annotations when full logs are unavailable."""
from pathlib import Path
import xml.etree.ElementTree as ET


def annotate(text):
    safe = text.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error title=Android build/test diagnostic::{safe}', flush=True)


for name in ['sdk-setup.log', 'android-build.log', 'android-native-test.log']:
    p = Path(name)
    if p.exists():
        text = p.read_text(errors='replace')
        if any(word in text for word in ['FAILURE', 'failed', 'error:', 'Exception']):
            annotate(name + '\n' + text[-5500:])
for p in Path('android/app/build').rglob('TEST-*.xml'):
    try:
        root = ET.parse(p).getroot()
        for node in root.findall('.//failure') + root.findall('.//error'):
            annotate(str(p) + '\n' + (node.get('message', '') + '\n' + (node.text or ''))[:5000])
    except (OSError, ET.ParseError):
        pass
