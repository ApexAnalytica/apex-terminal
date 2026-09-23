"""Run all macro validations in sequence."""
import sys

from . import ardl_synthetic, dxy_construction, event_study_synthetic, oos_channel_fits


def main() -> None:
    failures = 0
    for mod in (ardl_synthetic, event_study_synthetic, dxy_construction, oos_channel_fits):
        try:
            mod.main()
        except SystemExit as exc:
            if exc.code != 0:
                failures += 1
                print(f"\n[!] {mod.__name__} FAILED")
        print()
    if failures:
        print(f"=== {failures} validation suite(s) FAILED ===")
        sys.exit(1)
    print("=== ALL macro validations PASSED ===")


if __name__ == "__main__":
    main()
