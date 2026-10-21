"""Run on Windows before electron-builder. Bundle interpreter and engine dependencies."""
import subprocess
import sys
if sys.platform != 'win32':
    raise SystemExit('Build the Windows engine on Windows.')
subprocess.run([sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean', '--onedir',
    '--name', 'BlueyEngine', '--paths', '.', '--distpath', 'artifacts/engine',
    '--workpath', 'artifacts/engine-build', '--specpath', 'artifacts',
    '--collect-all', 'windows_use', '--collect-all', 'faster_whisper',
    '--collect-all', 'ctranslate2', '--collect-all', 'tokenizers',
    '--collect-all', 'uvicorn', '--collect-all', 'serial',
    '--hidden-import', 'websockets.legacy.client',
    '--recursive-copy-metadata', 'windows-use',
    '--collect-data', 'litellm', '--hidden-import', 'tiktoken_ext.openai_public',
    '--exclude-module', 'piper', '--exclude-module', 'tkinter',
    '--exclude-module', 'IPython', '--exclude-module', 'pytest',
    'scripts/engine-entry.py'], check=True)
