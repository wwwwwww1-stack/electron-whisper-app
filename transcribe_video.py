import whisper
import subprocess
import argparse
import os
from pathlib import Path
import tempfile # Not strictly needed if output path is given, but good for internal temp audio
import shutil
import torch

def format_timestamp(seconds: float, always_include_hours: bool = False, decimal_marker: str = ','):
    assert seconds >= 0, "non-negative timestamp expected"
    milliseconds = round(seconds * 1000.0)
    hours = milliseconds // 3_600_000
    milliseconds %= 3_600_000
    minutes = milliseconds // 60_000
    milliseconds %= 60_000
    seconds_val = milliseconds // 1_000 # Renamed to avoid conflict
    milliseconds %= 1_000
    if always_include_hours or hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds_val:02d}{decimal_marker}{milliseconds:03d}"
    else:
        return f"{minutes:02d}:{seconds_val:02d}{decimal_marker}{milliseconds:03d}"

def write_srt_to_path(result: dict, srt_file_path: Path): # Renamed for clarity
    """Writes the transcript in SRT format to the specified path."""
    srt_file_path.parent.mkdir(parents=True, exist_ok=True) # Ensure directory exists
    with open(srt_file_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            start_time = format_timestamp(segment["start"])
            end_time = format_timestamp(segment["end"])
            text = segment["text"].strip()
            f.write(f"{i}\n")
            f.write(f"{start_time} --> {end_time}\n")
            f.write(f"{text}\n\n")
    print(f"SRT file saved to: {srt_file_path}", flush=True)
    # Special marker for Electron to pick up the output path
    print(f"SRT_OUTPUT_PATH:{srt_file_path}", flush=True)


def transcribe_video(
    video_path_str: str,
    output_srt_path_str: str, # New argument
    model_name: str = "base",
    language: str = None,
    task: str = "transcribe"
):
    video_file = Path(video_path_str)
    output_srt_path = Path(output_srt_path_str) # Convert to Path object

    if not video_file.exists():
        print(f"Error: Video file not found at {video_path_str}", flush=True)
        return

    # Temporary directory for audio extraction
    temp_dir_audio = tempfile.mkdtemp(prefix="whisper_audio_")
    temp_audio_path = Path(temp_dir_audio) / (video_file.stem + ".wav")

    try:
        print(f"Extracting audio from '{video_file.name}'...", flush=True)
        ffmpeg_command = [
            "ffmpeg", "-y",
            "-i", str(video_file),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            "-loglevel", "error",
            str(temp_audio_path)
        ]
        process = subprocess.Popen(ffmpeg_command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            print(f"Error extracting audio with FFmpeg:", flush=True)
            if stdout: print(f"FFmpeg stdout: {stdout.decode('utf-8', errors='ignore')}", flush=True)
            if stderr: print(f"FFmpeg stderr: {stderr.decode('utf-8', errors='ignore')}", flush=True)
            return
        print(f"Audio extracted successfully to temporary file: {temp_audio_path}", flush=True)

        device = "cpu"
        fp16_mode = False
        try:
            if torch.backends.mps.is_available() and torch.backends.mps.is_built():
                device = "mps"
                fp16_mode = True
                print("Attempting to use MPS (Apple Silicon GPU) with fp16...", flush=True)
                model = whisper.load_model(model_name, device=device)
            elif torch.cuda.is_available():
                device = "cuda"
                fp16_mode = True
                print("CUDA is available. Using CUDA for acceleration with fp16.", flush=True)
                model = whisper.load_model(model_name, device=device)
            else:
                print("Using CPU for transcription.", flush=True)
                model = whisper.load_model(model_name, device=device)
        except Exception as e:
            print(f"GPU acceleration failed: {str(e)}\nFalling back to CPU.", flush=True)
            device = "cpu"
            fp16_mode = False
            model = whisper.load_model(model_name, device=device)

        print("Transcribing audio... (This may take a while)", flush=True)
        transcribe_options = {"task": task, "fp16": fp16_mode}
        if language:
            transcribe_options["language"] = language

        result = model.transcribe(str(temp_audio_path), **transcribe_options)

        print("Transcription complete. Generating SRT file...", flush=True)
        write_srt_to_path(result, output_srt_path) # Use the new function and path

    except Exception as e:
        print(f"An error occurred: {e}", flush=True)
    finally:
        if temp_audio_path.exists():
            try:
                os.remove(temp_audio_path)
                print(f"Temporary audio file {temp_audio_path} deleted.", flush=True)
            except OSError as e_os:
                print(f"Error deleting temporary file {temp_audio_path}: {e_os}", flush=True)
        if Path(temp_dir_audio).exists():
            try:
                shutil.rmtree(temp_dir_audio)
                print(f"Temporary directory {temp_dir_audio} deleted.", flush=True)
            except OSError as e_os_dir:
                 print(f"Error deleting temporary directory {temp_dir_audio}: {e_os_dir}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe video to SRT using OpenAI Whisper (for Electron).")
    parser.add_argument("video_path", help="Path to the video file.")
    parser.add_argument("--output_srt_path", required=True, help="Full path where the SRT file should be saved.")
    parser.add_argument(
        "--model",
        default="base",
        choices=["tiny", "base", "small", "medium", "large", "large-v2", "large-v3"],
        help="Whisper model to use (default: base)."
    )
    parser.add_argument(
        "--language",
        help="Language code for transcription (e.g., 'en', 'zh', 'ja'). If not specified, Whisper will auto-detect."
    )
    parser.add_argument(
        "--task",
        default="transcribe",
        choices=["transcribe", "translate"],
        help="Task to perform: 'transcribe' or 'translate' (default: transcribe)."
    )

    args = parser.parse_args()

    print(f"Python script called with: video_path='{args.video_path}', output_srt_path='{args.output_srt_path}', model='{args.model}', language='{args.language}', task='{args.task}'", flush=True)

    transcribe_video(
        video_path_str=args.video_path,
        output_srt_path_str=args.output_srt_path,
        model_name=args.model,
        language=args.language,
        task=args.task
    )