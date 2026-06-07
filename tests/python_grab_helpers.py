#!/usr/bin/env python3
"""
Tests for the Python grab-helper changes shipped in the category-editor overhaul:

  1. ai_helpers._pick_prompt_type — person/place/object/concept classification
  2. ai_helpers.generate_ai_image — returns None when API key missing
  3. wikipedia._fetch_brave_links — returns [] when BRAVE_API_KEY not set
  4. wikipedia._fetch_brave_links — skips Wikipedia URLs in results
  5. wikipedia.create_poster_from_wikipedia — poster has caption on thumbnail image
  6. wikipedia.create_poster_from_wikipedia — brave_links flag adds links beyond Wikipedia
  7. wikipedia.generate_posters — accepts brave_links kwarg without error
  8. grab.parse_args — --brave-links flag is accepted

Run: python tests/python_grab_helpers.py
"""

import importlib
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# ── Path setup ────────────────────────────────────────────────────────────────
REPO = Path(__file__).parent.parent
# Insert the python/ directory so that `sources` is importable as a package
sys.path.insert(0, str(REPO / "scripts" / "python"))

from sources import ai_helpers        # package-relative import works from python/
from sources import wikipedia as wiki_mod


# ── Helpers ───────────────────────────────────────────────────────────────────

def _minimal_wiki_summary(title="Test Topic"):
    """Returns the minimal dict the Wikipedia REST API returns."""
    return {
        "title": title,
        "description": "A British mathematician and computer scientist",
        "extract": "Test extract text.",
        "content_urls": {"desktop": {"page": f"https://en.wikipedia.org/wiki/{title}"}},
        "thumbnail": {"source": "https://example.com/thumb.jpg"},
    }


def _minimal_existing_index():
    return {"titles": set(), "sources": set(), "tags": set(), "links": set()}


# ── 1-2: ai_helpers ──────────────────────────────────────────────────────────

class TestPickPromptType(unittest.TestCase):

    def test_scientist_subtitle_is_person(self):
        result = ai_helpers._pick_prompt_type("British mathematician and computer scientist")
        self.assertEqual(result, "person")

    def test_researcher_is_person(self):
        result = ai_helpers._pick_prompt_type("An AI researcher at Stanford")
        self.assertEqual(result, "person")

    def test_city_subtitle_is_place(self):
        result = ai_helpers._pick_prompt_type("capital city of France")
        self.assertEqual(result, "place")

    def test_device_subtitle_is_object(self):
        result = ai_helpers._pick_prompt_type("computing device invented in 1945")
        self.assertEqual(result, "object")

    def test_empty_subtitle_is_concept(self):
        result = ai_helpers._pick_prompt_type("")
        self.assertEqual(result, "concept")

    def test_abstract_subtitle_is_concept(self):
        result = ai_helpers._pick_prompt_type("the study of algorithms that learn from data")
        self.assertEqual(result, "concept")

    def test_case_insensitive(self):
        result = ai_helpers._pick_prompt_type("MATHEMATICIAN who proved the halting problem")
        self.assertEqual(result, "person")


class TestGenerateAiImageNoKey(unittest.TestCase):

    def test_returns_none_when_no_api_key(self):
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}):
            result = ai_helpers.generate_ai_image("Test Topic", "some subtitle")
        self.assertIsNone(result)


# ── 3-4: wikipedia._fetch_brave_links ────────────────────────────────────────

class TestFetchBraveLinks(unittest.TestCase):

    def test_returns_empty_when_no_api_key(self):
        with patch.dict(os.environ, {"BRAVE_API_KEY": ""}):
            result = wiki_mod._fetch_brave_links("Alan Turing")
        self.assertEqual(result, [])

    def test_skips_wikipedia_urls(self):
        fake_results = {
            "web": {
                "results": [
                    {"url": "https://en.wikipedia.org/wiki/Alan_Turing", "title": "Alan Turing - Wikipedia"},
                    {"url": "https://example.com/alan-turing", "title": "Alan Turing Biography"},
                ]
            }
        }
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = fake_results

        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
            with patch("sources.wikipedia.requests.get", return_value=mock_resp):
                result = wiki_mod._fetch_brave_links("Alan Turing", count=2)

        # Wikipedia URL must be filtered out
        urls = [link["url"] for link in result]
        self.assertNotIn("https://en.wikipedia.org/wiki/Alan_Turing", urls)
        self.assertIn("https://example.com/alan-turing", urls)

    def test_returns_at_most_count_links(self):
        fake_results = {
            "web": {
                "results": [
                    {"url": f"https://example.com/{i}", "title": f"Result {i}"}
                    for i in range(10)
                ]
            }
        }
        mock_resp = MagicMock()
        mock_resp.ok = True
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = fake_results

        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
            with patch("sources.wikipedia.requests.get", return_value=mock_resp):
                result = wiki_mod._fetch_brave_links("Some Topic", count=2)

        self.assertLessEqual(len(result), 2)

    def test_returns_empty_on_network_error(self):
        with patch.dict(os.environ, {"BRAVE_API_KEY": "test-key"}):
            with patch("sources.wikipedia.requests.get", side_effect=Exception("network error")):
                result = wiki_mod._fetch_brave_links("Alan Turing")
        self.assertEqual(result, [])


# ── 5-6: wikipedia.create_poster_from_wikipedia ──────────────────────────────

class TestCreatePosterFromWikipedia(unittest.TestCase):

    def _mock_fetch(self, data):
        """Patch fetch_wikipedia_summary to return `data`."""
        return patch("sources.wikipedia.fetch_wikipedia_summary", return_value=(data, None))

    def test_thumbnail_image_has_wikimedia_caption(self):
        data = _minimal_wiki_summary("Alan Turing")
        with self._mock_fetch(data):
            poster, _ = wiki_mod.create_poster_from_wikipedia(
                "Alan_Turing", "pioneers", _minimal_existing_index()
            )
        image = poster["back"].get("image", {})
        self.assertIn("caption", image)
        self.assertIn("Wikimedia", image["caption"])

    def test_brave_links_flag_adds_extra_link(self):
        data = _minimal_wiki_summary("Alan Turing")
        fake_brave_links = [{"type": "external", "label": "Extra", "url": "https://extra.com"}]
        with self._mock_fetch(data):
            with patch("sources.wikipedia._fetch_brave_links", return_value=fake_brave_links):
                poster, _ = wiki_mod.create_poster_from_wikipedia(
                    "Alan_Turing", "pioneers", _minimal_existing_index(), brave_links=True
                )
        urls = [l["url"] for l in poster["back"]["links"]]
        self.assertIn("https://extra.com", urls)

    def test_brave_links_false_does_not_add_brave_links(self):
        data = _minimal_wiki_summary("Alan Turing")
        with self._mock_fetch(data):
            with patch("sources.wikipedia._fetch_brave_links") as mock_brave:
                poster, _ = wiki_mod.create_poster_from_wikipedia(
                    "Alan_Turing", "pioneers", _minimal_existing_index(), brave_links=False
                )
        mock_brave.assert_not_called()

    def test_wikipedia_link_always_present(self):
        data = _minimal_wiki_summary("Alan Turing")
        with self._mock_fetch(data):
            poster, _ = wiki_mod.create_poster_from_wikipedia(
                "Alan_Turing", "pioneers", _minimal_existing_index()
            )
        links = poster["back"]["links"]
        self.assertTrue(any("wikipedia" in l["url"].lower() for l in links))
        primary = next((l for l in links if l.get("primary")), None)
        self.assertIsNotNone(primary)


# ── 7: wikipedia.generate_posters accepts brave_links kwarg ──────────────────

class TestGeneratePostersSignature(unittest.TestCase):

    def test_accepts_brave_links_kwarg(self):
        import inspect
        sig = inspect.signature(wiki_mod.generate_posters)
        self.assertIn("brave_links", sig.parameters)
        self.assertIs(sig.parameters["brave_links"].default, False)


# ── 8: grab.py CLI accepts --brave-links ─────────────────────────────────────

class TestGrabArgParser(unittest.TestCase):

    def test_brave_links_flag_accepted(self):
        import argparse
        # Import parse_args by reading grab.py as a module in a subprocess-safe way
        grab_path = REPO / "scripts" / "python" / "grab.py"
        spec = importlib.util.spec_from_file_location("grab_module", grab_path)
        grab_mod = importlib.util.module_from_spec(spec)
        # parse_args is defined in grab.py; exec only the function definitions
        with open(grab_path) as f:
            source = f.read()
        # Extract parse_args by patching sys.argv to avoid running main()
        saved_argv = sys.argv[:]
        sys.argv = ["grab.py", "--source", "wikipedia", "--brave-links"]
        try:
            # Compile and exec only safe parts
            exec_globals = {"__name__": "test", "argparse": argparse}
            exec(compile(source, grab_path, "exec"), exec_globals)
            args = exec_globals["parse_args"]()
            self.assertTrue(args.brave_links)
        finally:
            sys.argv = saved_argv

    def test_brave_links_defaults_false(self):
        import argparse
        grab_path = REPO / "scripts" / "python" / "grab.py"
        saved_argv = sys.argv[:]
        sys.argv = ["grab.py", "--source", "wikipedia", "--topics", "Test"]
        try:
            exec_globals = {"__name__": "test", "argparse": argparse}
            with open(grab_path) as f:
                source = f.read()
            exec(compile(source, grab_path, "exec"), exec_globals)
            args = exec_globals["parse_args"]()
            self.assertFalse(args.brave_links)
        finally:
            sys.argv = saved_argv


# ── Runner ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    unittest.main(verbosity=2)
