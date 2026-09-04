from __future__ import annotations

import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

MODULES = [
    "tests.test_classifier",
    "tests.test_upload",
    "tests.test_auto_materialize",
]


def main() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromNames(MODULES)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    if not result.wasSuccessful():
        return 1

    for script in ["tests/test_generator_mock.py", "tests/test_build_mock.py"]:
        completed = subprocess.run([sys.executable, script], cwd=ROOT, check=False)
        if completed.returncode != 0:
            return completed.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
