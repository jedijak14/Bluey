"""Expose a bounded diagnostic in Actions annotations when full logs are unavailable."""
from pathlib import Path
import xml.etree.ElementTree as ET


def annotate(text):
    for offset in range(0, len(text), 2000):
        safe = text[offset:offset+2000].replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print(f'::error title=Android build/test diagnostic::{safe}', flush=True)


for name in ['sdk-setup.log', 'android-build.log', 'android-native-test.log', 'android-crash.log']:
    p = Path(name)
    if p.exists():
        text = p.read_text(errors='replace')
        if any(word in text for word in ['FAILURE', 'failed', 'error:', 'Exception']):
            lines = text.splitlines()
            important = [line for line in lines if any(term in line.lower() for term in ('crash', 'failed', 'error:', 'assertion', 'instrumentation', 'exception:'))]
            annotate(name + '\n' + '\n'.join(important)[-6000:] + '\n' + text[-1500:])
for p in Path('android/app/build').rglob('TEST-*.xml'):
    try:
        root = ET.parse(p).getroot()
        for node in root.findall('.//failure') + root.findall('.//error'):
            annotate(str(p) + '\n' + (node.get('message', '') + '\n' + (node.text or ''))[:5000])
    except (OSError, ET.ParseError):
        pass
