"""Create a transparent WebM from Bee There's film-strip video.

The script removes only dark pixels that are connected to a frame edge. Dark
details fully enclosed by a card (hair, clothes, shadows, black card artwork)
are preserved. It needs OpenCV for frame processing and FFmpeg for encoding a
VP9 WebM with alpha.

Usage:
    python -m pip install opencv-python
    python convert_video.py

Optional:
    python convert_video.py --threshold 10 --crop-padding 16 --crf 28
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

try:
    import cv2
    import numpy as np
except ImportError as error:
    raise SystemExit(
        "Hiányzó csomag: telepítsd az OpenCV-t ezzel: python -m pip install opencv-python"
    ) from error


ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT = ROOT / "assets" / "animo-film-strip-720p.mp4"
DEFAULT_OUTPUT = ROOT / "assets" / "beevid_transparent.webm"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Külső fekete videóháttér eltávolítása.")
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Forrás MP4 fájl")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Átlátszó WebM kimenet")
    parser.add_argument(
        "--threshold",
        type=int,
        default=8,
        help="A feketének tekintett maximális RGB érték (alapértelmezés: 8)",
    )
    parser.add_argument("--crf", type=int, default=28, help="VP9 minőség, kisebb = jobb (alapértelmezés: 28)")
    parser.add_argument(
        "--crop-padding",
        type=int,
        default=20,
        help="A látható tartalom felett és alatt meghagyott átlátszó margó pixelben (alapértelmezés: 20)",
    )
    parser.add_argument(
        "--min-opaque-pixels",
        type=int,
        default=32,
        help="Ennyi látható pixel szükséges ahhoz, hogy egy sor a videótartalom része legyen (alapértelmezés: 32)",
    )
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg parancs vagy teljes elérési út")
    return parser.parse_args()


def erase_edge_connected_black(frame_bgr: np.ndarray, threshold: int) -> np.ndarray:
    """Return RGBA pixels with only edge-connected black made transparent."""
    rgba = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGBA)
    black = (np.max(rgba[:, :, :3], axis=2) <= threshold).astype(np.uint8)

    # Every dark connected component touching one of the four outer edges is
    # background. Enclosed dark components belong to the card content.
    _, labels = cv2.connectedComponents(black, connectivity=4)
    border_labels = np.unique(
        np.concatenate((labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]))
    )
    outer_background = np.isin(labels, border_labels) & (black == 1)
    rgba[outer_background, 3] = 0
    return rgba


def find_vertical_crop(source: Path, threshold: int, padding: int, minimum_pixels: int) -> tuple[int, int, int]:
    """Find the vertical bounds of meaningful content across the full video."""
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise SystemExit(f"Nem nyitható meg a videó: {source}")
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    top, bottom = height, 0
    frame_count = 0
    try:
        while True:
            success, frame = capture.read()
            if not success:
                break
            frame_count += 1
            rgba = erase_edge_connected_black(frame, threshold)
            visible_rows = np.flatnonzero((rgba[:, :, 3] > 0).sum(axis=1) >= minimum_pixels)
            if visible_rows.size:
                top = min(top, int(visible_rows[0]))
                bottom = max(bottom, int(visible_rows[-1]) + 1)
    finally:
        capture.release()

    if bottom <= top:
        return 0, height, frame_count
    top = max(0, top - padding)
    bottom = min(height, bottom + padding)
    # yuva420p uses 4:2:0 chroma, so the final crop height must be even.
    top -= top % 2
    if (bottom - top) % 2:
        bottom = min(height, bottom + 1) if bottom < height else bottom - 1
    return top, bottom, frame_count


def main() -> None:
    options = parse_arguments()
    source = options.input.expanduser().resolve()
    destination = options.output.expanduser().resolve()
    ffmpeg = shutil.which(options.ffmpeg) if Path(options.ffmpeg).name == options.ffmpeg else options.ffmpeg

    if not source.is_file():
        raise SystemExit(f"Nem található a forrásvideó: {source}")
    if not ffmpeg:
        raise SystemExit("Az FFmpeg nem található. Telepítsd, vagy add meg: --ffmpeg C:\\...\\ffmpeg.exe")
    if not 0 <= options.threshold <= 255:
        raise SystemExit("A --threshold értéknek 0 és 255 között kell lennie.")
    if options.crop_padding < 0 or options.min_opaque_pixels < 1:
        raise SystemExit("A vágási paraméterek csak pozitív értékek lehetnek.")

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise SystemExit(f"Nem nyitható meg a videó: {source}")
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frames_per_second = capture.get(cv2.CAP_PROP_FPS) or 60.0
    reported_frame_count = int(round(capture.get(cv2.CAP_PROP_FRAME_COUNT)))
    if width <= 0 or height <= 0:
        raise SystemExit("A videó felbontása nem olvasható ki.")
    capture.release()

    print("A tényleges videótartalom felső és alsó szélének keresése…")
    crop_top, crop_bottom, analyzed_frame_count = find_vertical_crop(
        source, options.threshold, options.crop_padding, options.min_opaque_pixels
    )
    if reported_frame_count and analyzed_frame_count != reported_frame_count:
        raise SystemExit(
            f"Képkockaszám eltérés: a videó {reported_frame_count}, az elemzés {analyzed_frame_count} képkockát olvasott."
        )
    output_height = crop_bottom - crop_top
    exact_fps = Fraction(frames_per_second).limit_denominator(100_000)
    fps_for_ffmpeg = f"{exact_fps.numerator}/{exact_fps.denominator}"
    print(
        f"Vágás: {height}px → {output_height}px (felső levágás: {crop_top}px); "
        f"képkockák: {analyzed_frame_count}; FPS: {fps_for_ffmpeg}"
    )

    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise SystemExit(f"Nem nyitható meg a videó: {source}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(ffmpeg), "-y", "-f", "rawvideo", "-pixel_format", "rgba",
        "-video_size", f"{width}x{output_height}", "-framerate", fps_for_ffmpeg,
        "-i", "-", "-an", "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-auto-alt-ref", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "4",
        "-crf", str(options.crf), "-b:v", "0", "-metadata:s:v:0", "alpha_mode=1", str(destination),
    ]
    encoder = subprocess.Popen(command, stdin=subprocess.PIPE)
    frame_number = 0
    try:
        while True:
            success, frame = capture.read()
            if not success:
                break
            rgba = erase_edge_connected_black(frame, options.threshold)
            encoder.stdin.write(rgba[crop_top:crop_bottom].tobytes())
            frame_number += 1
            if frame_number % 120 == 0:
                print(f"Feldolgozott képkockák: {frame_number}")
    except BrokenPipeError as error:
        raise SystemExit("Az FFmpeg kódolás közben leállt.") from error
    finally:
        capture.release()
        if encoder.stdin:
            encoder.stdin.close()

    if encoder.wait() != 0:
        raise SystemExit("Az FFmpeg nem tudta elkészíteni a WebM fájlt.")
    if frame_number != analyzed_frame_count:
        raise SystemExit(
            f"Képkockaszám eltérés: az elemzés {analyzed_frame_count}, a kódolás {frame_number} képkockát dolgozott fel."
        )
    print(
        f"Kész: {destination} ({frame_number} képkocka, {width}×{output_height}, "
        f"{fps_for_ffmpeg} fps)"
    )


if __name__ == "__main__":
    main()
