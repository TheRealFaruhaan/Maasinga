"""Run every pipeline step in order. Usage: python pipeline/run_all.py"""
import runpy
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
STEPS = [
    "01_ingest.py",
    "02_weather.py",
    "03_sea_sensor.py",
    "04_trips.py",
    "05_network.py",
    "06_safety.py",
    "07_signal.py",
    "08_replay.py",
    "09_taxi.py",
    "analysis/north_harbour.py",
    "10_boat_names.py",
    "11_app_data.py",
    "12_predict.py",
    "13_harbour_timeline.py",
    "14_bus.py",
]

sys.path.insert(0, str(HERE))
from common import RAW  # noqa: E402

# The taxi step needs the Avas and MACL files; the dashboard does not use its output, so skip it if they are missing.
OPTIONAL = {"09_taxi.py": [RAW / "Avas_Ride" / "avas_rides_aug_sep_2026.csv", RAW / "MACL" / "MACL" / "Airport traffic_Dataset_27092026.csv"],
            "10_boat_names.py": [RAW / "imei_name_guess_all.csv"],
            "14_bus.py": [RAW / "MTCC" / "MTCC.xlsx"]}

for step in STEPS:
    print(f"\n== {step}")
    missing = [p for p in OPTIONAL.get(step, []) if not p.exists()]
    if missing:
        print(f"skipped: {missing[0]} not found (optional step)")
        continue
    runpy.run_path(str(HERE / step), run_name="__main__")
