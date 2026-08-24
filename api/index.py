"""Root-level Vercel entrypoint for the `fish-tracker` project, whose git
integration deploys the repo root. The backend lives in backend/; this shim
puts it on the path so a git-triggered deployment serves the same API as a
manual one, instead of a 404 site."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
