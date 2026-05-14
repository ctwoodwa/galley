"""Shared pytest fixtures for galley/prose tests.

Discoverable by pytest from any test file under `galley/prose/tests/`.
Pure-Python; depends only on the prose-telemetry venv (pytest, pyyaml).
"""

from __future__ import annotations

from pathlib import Path

import pytest

from prose_telemetry._common.types import BookProfile


# ─── Path constants ────────────────────────────────────────────────────────

# This file lives at galley/prose/tests/conftest.py. PROSE_ROOT is
# galley/prose/.
PROSE_ROOT = Path(__file__).resolve().parent.parent

FIXTURES_DIR = PROSE_ROOT / "tests" / "fixtures"
BOOKS_DIR = PROSE_ROOT / "books"
NON_BOOK_A_DIR = FIXTURES_DIR / "non_book_a"
NON_BOOK_B_DIR = FIXTURES_DIR / "non_book_b"


# ─── BookProfile fixtures ──────────────────────────────────────────────────


@pytest.fixture(scope="session")
def inverted_stack_profile() -> BookProfile:
    """Anna-voice first-customer profile from the registry."""
    return BookProfile.from_yaml(BOOKS_DIR / "the-inverted-stack.yaml")


@pytest.fixture(scope="session")
def non_book_a_profile() -> BookProfile:
    """Strict-thresholds synthetic profile (literary-fiction register)."""
    return BookProfile.from_yaml(NON_BOOK_A_DIR / "book.editorial.yaml")


@pytest.fixture(scope="session")
def non_book_b_profile() -> BookProfile:
    """Loose-thresholds synthetic profile (technical-nonfiction register)."""
    return BookProfile.from_yaml(NON_BOOK_B_DIR / "book.editorial.yaml")


# ─── Chapter fixtures ──────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def non_book_a_sample() -> Path:
    """Path to the synthetic chapter for non_book_a."""
    return NON_BOOK_A_DIR / "sample.md"


@pytest.fixture(scope="session")
def non_book_b_sample() -> Path:
    """Path to the synthetic chapter for non_book_b."""
    return NON_BOOK_B_DIR / "sample.md"
