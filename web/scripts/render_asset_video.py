import argparse, json, subprocess
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--product-slug", required=True)
    ap.add_argument("--resource-id", required=True)
    ap.add_argument("--limit", type=int, default=6)
    ap.add_argument("--seconds", type=int, default=5)
    args = ap.parse_args()

    cwd = Path.cwd()

    if (cwd / "web" / "data").exists():
        root = cwd / "web"
    else:
        root = cwd

    manifest_path = root / "data" / "product-assets" / args.product_slug / "resources" / args.resource_id / "manifest.json"

    public_out_dir = root / "public" / "videos" / args.product_slug
    work_dir = root / "data" / "video-work" / args.product_slug / args.resource_id
    public_out_dir.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text("utf-8"))
    assets = manifest["assets"][: args.limit]

    clips = []
    width, height, fps = 1920, 1080, 30
    frames = args.seconds * fps

    for i, asset in enumerate(assets, 1):
        image_path = root / "public" / asset["publicPath"].lstrip("/")
        clip_path = work_dir / f"scene_{i:02d}.mp4"

        vf = (
            f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,"
            f"zoompan=z='min(zoom+0.0007,1.12)':d={frames}:s={width}x{height}:fps={fps},"
            f"format=yuv420p"
        )

        subprocess.run([
            "ffmpeg", "-y",
            "-loop", "1",
            "-i", str(image_path),
            "-vf", vf,
            "-t", str(args.seconds),
            "-r", str(fps),
            "-an",
            str(clip_path),
        ], check=True)

        clips.append(clip_path)

    list_path = work_dir / "clips.txt"
    list_path.write_text("".join(f"file '{p.resolve()}'\n" for p in clips), encoding="utf-8")

    output_name = f"{args.resource_id}-preview.mp4"
    final_path = public_out_dir / output_name

    subprocess.run([
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(list_path),
        "-c", "copy",
        str(final_path),
    ], check=True)

    print(json.dumps({
        "ok": True,
        "productSlug": args.product_slug,
        "resourceId": args.resource_id,
        "filename": output_name,
        "publicPath": f"/videos/{args.product_slug}/{output_name}",
        "sceneCount": len(clips),
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
