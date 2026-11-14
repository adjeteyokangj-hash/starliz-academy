"""Trusted entry point; untrusted video is decoded only inside this gVisor job."""
import hashlib
import json
import subprocess
import sys

maximum = 4 * 1024 * 1024
data = sys.stdin.buffer.read(maximum + 1)
if not 128 <= len(data) <= maximum:
    raise ValueError("invalid-recording-size")
with open("/tmp/demonstration.webm", "xb") as handle:
    handle.write(data)
probe = subprocess.run([
    "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
    "-show_entries", "stream=codec_type,codec_name,width,height",
    "-of", "json", "/tmp/demonstration.webm",
], capture_output=True, timeout=4, check=True)
streams = json.loads(probe.stdout)["streams"]
if len(streams) != 1 or streams[0].get("codec_type") != "video" or streams[0].get("codec_name") not in ("vp8", "vp9", "av1"):
    raise ValueError("one-video-track-required")
width, height = streams[0].get("width", 0), streams[0].get("height", 0)
if not 16 <= width <= 1920 or not 16 <= height <= 1080:
    raise ValueError("unsupported-recording-dimensions")
decoded = subprocess.run([
    "ffmpeg", "-v", "error", "-nostdin", "-protocol_whitelist", "file,pipe",
    "-threads", "1", "-filter_threads", "1", "-i", "/tmp/demonstration.webm",
    "-map", "0:v:0", "-an", "-sn", "-dn", "-progress", "pipe:1", "-nostats", "-f", "null", "-",
], capture_output=True, timeout=9, check=True)
if decoded.stderr:
    raise ValueError("recording-decode-errors")
progress = dict(line.split("=", 1) for line in decoded.stdout.decode("utf8").splitlines() if "=" in line)
frames = int(progress.get("frame", "0"))
duration_us = int(progress.get("out_time_us", "0"))
if progress.get("progress") != "end" or frames < 2 or not 100_000 <= duration_us <= 46_000_000:
    raise ValueError("invalid-recording-duration-or-frames")
print(json.dumps({"sha256": hashlib.sha256(data).hexdigest(), "size": len(data), "width": width, "height": height, "frames": frames, "durationMs": duration_us / 1000, "decoded": True}))
