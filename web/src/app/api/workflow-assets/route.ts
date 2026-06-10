import { NextRequest, NextResponse } from "next/server";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";

const WEB_ROOT = process.cwd();

function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

async function readJsonSafe(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

async function loadProductAssets(productSlug: string) {
  const productRoot = path.join(WEB_ROOT, "data", "product-assets", productSlug);
  const resourcesDir = path.join(productRoot, "resources");

  let resourceIds: string[] = [];

  try {
    resourceIds = await readdir(resourcesDir);
  } catch {
    resourceIds = [];
  }

  const resources = await Promise.all(
    resourceIds.map(async (resourceId) => {
      const manifestPath = path.join(resourcesDir, resourceId, "manifest.json");
      const manifest = await readJsonSafe(manifestPath, null);

      return {
        resourceId,
        resourceName: manifest?.resourceName ?? resourceId,
        assetCount: manifest?.assetCount ?? manifest?.assets?.length ?? 0,
        assets: manifest?.assets ?? [],
      };
    }),
  );

  const selectedPath = path.join(productRoot, "selected-assets.json");

  const selected = await readJsonSafe(selectedPath, {
    productSlug,
    selectedPublicPaths: [],
  });

  return {
    productSlug,
    resources,
    selectedPublicPaths: selected.selectedPublicPaths ?? [],
  };
}

export async function GET(req: NextRequest) {
  const productSlug = slugify(
    req.nextUrl.searchParams.get("productSlug") ?? "",
  );

  return NextResponse.json(await loadProductAssets(productSlug));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const productSlug = slugify(String(body.productSlug ?? ""));
  const selectedPublicPaths = Array.isArray(body.selectedPublicPaths)
    ? body.selectedPublicPaths
    : [];

  const productRoot = path.join(WEB_ROOT, "data", "product-assets", productSlug);

  await mkdir(productRoot, { recursive: true });

  await writeFile(
    path.join(productRoot, "selected-assets.json"),
    JSON.stringify(
      {
        productSlug,
        selectedPublicPaths,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf-8",
  );

  return NextResponse.json(await loadProductAssets(productSlug));
}
