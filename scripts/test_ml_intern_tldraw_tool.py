import unittest
from unittest.mock import patch

import ml_intern_tldraw_tool


class MlInternTldrawToolReplayTest(unittest.TestCase):
    def test_forwards_finite_bounded_area_and_rejects_unsafe_values(self) -> None:
        calls: list[dict[str, object]] = []
        base = {
            "manifestId": "manifest",
            "binding": "binding",
            "capabilityId": "canvas.inspect",
            "instruction": "Inspect this bounded area.",
            "context": "selection-or-area",
        }
        bounds = {"x": -120, "y": 80, "w": 640, "h": 360}

        def request(_url: str, **kwargs: object) -> dict[str, object]:
            calls.append(kwargs["payload"])
            return {
                "id": "bounded-template-test",
                "status": "succeeded",
                "capabilityId": "canvas.inspect",
                "summary": "Inspected a bounded area.",
            }

        with patch.object(ml_intern_tldraw_tool, "_json_request", side_effect=request):
            result = ml_intern_tldraw_tool._execute_and_wait({**base, "bounds": bounds})
        self.assertEqual(result["status"], "succeeded")
        self.assertEqual(
            calls[0]["bounds"], {key: float(value) for key, value in bounds.items()}
        )

        for invalid in (
            {**base, "context": "selection", "bounds": bounds},
            {**base, "bounds": {**bounds, "x": float("nan")}},
            {**base, "bounds": {**bounds, "w": 0}},
            {**base, "bounds": {**bounds, "w": 8192, "h": 8192}},
        ):
            with self.subTest(bounds=invalid["bounds"]):
                with self.assertRaises(ValueError):
                    ml_intern_tldraw_tool._execute_and_wait(invalid)

    def test_terminal_execute_replay_returns_without_polling_status(self) -> None:
        arguments = {
            "manifestId": "manifest",
            "binding": "binding",
            "capabilityId": "canvas.inspect",
            "instruction": "Inspect the bounded selection.",
            "context": "selection",
            "idempotencyKey": "evicted-python-op",
        }

        for terminal_status in ("succeeded", "failed"):
            with self.subTest(status=terminal_status):
                calls: list[str] = []
                terminal = {
                    "id": "evicted-python-op",
                    "status": terminal_status,
                    "capabilityId": "canvas.inspect",
                    "summary": "Replayed a compact terminal receipt.",
                }

                def request(url: str, **_kwargs: object) -> dict[str, object]:
                    calls.append(url)
                    self.assertTrue(url.endswith("/execute"))
                    return terminal

                with patch.object(
                    ml_intern_tldraw_tool, "_json_request", side_effect=request
                ):
                    result = ml_intern_tldraw_tool._execute_and_wait(arguments)

                self.assertEqual(
                    result,
                    {
                        "requestId": "evicted-python-op",
                        "status": terminal_status,
                        "capabilityId": "canvas.inspect",
                        "summary": "Replayed a compact terminal receipt.",
                    },
                )
                self.assertEqual(len(calls), 1)


if __name__ == "__main__":
    unittest.main()
