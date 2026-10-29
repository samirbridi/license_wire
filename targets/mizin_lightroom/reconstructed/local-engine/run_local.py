"""Minimal bootstrap: preserve an actionable log even if a native dependency fails."""
import json
import sys
import traceback
from pathlib import Path


def main():
    if len(sys.argv) != 3 or sys.argv[1] != '--job':
        return 2
    job = Path(sys.argv[2]).resolve(strict=True)
    if not (job / 'request.json').is_file():
        return 2
    with (job / 'bootstrap.log').open('x', encoding='utf-8', buffering=1) as log:
        sys.stdout = log
        sys.stderr = log
        try:
            from local_engine import main as run
            return run()
        except BaseException:
            traceback.print_exc()
            with (job / 'startup-error.json').open('x', encoding='utf-8') as output:
                json.dump({'error': 'O motor nao iniciou. Consulte bootstrap.log nesta pasta.'}, output)
            return 1


if __name__ == '__main__':
    raise SystemExit(main())
