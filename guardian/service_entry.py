"""Installed under an administrator-only directory; launched by SCM with python -I."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from backend.guardian_windows import main
main()
