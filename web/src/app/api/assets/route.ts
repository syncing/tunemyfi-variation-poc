import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";

const WEB_ROOT = process.cwd();
const PROJECT_ROOT = "/home/hycho/projects/tunemyfi-variation-poc";
const UV_BIN = "/home/hycho/.local/bin/uv";
const DATA_ROOT = path.join(WEB_ROOT, "data", "product-assets");

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

async function readProduct(productSlug: string) {
  const productPath = path.join(DATA_ROOT, productSlug, "product.json");

  const product = await readJsonSafe(productPath, {
    productSlug,
    productName: productSlug,
    resources: [],
  });

  const resources = await Promise.all(
    (product.resources ?? []).map(async (resource: any) => {
      const manifestPath = path.join(
        DATA_ROOT,
        productSlug,
        "resources",
        resource.resourceId,
        "manifest.json",
      );

      const manifest = await readJsonSafe(manifestPath, null);

      return {
        ...resource,
        manifest,
      };
    }),
  );

  return {
    ...product,
    resources,
  };
}

function runImporter(input: {
  productSlug: string;
  productName: string;
  resourceId: string;
  resourceName: string;
  sourceUrl: string;
  rule: string;
  copyrightNote?: string;
  clean?: boolean;
}) {
  return new Promise<any>((resolve, reject) => {
    const scriptArgs = [
      "run",
      "python",
      "web/scripts/import_assets.py",
      "--source-url",
      input.sourceUrl,
      "--product-slug",
      input.productSlug,
      "--product-name",
      input.productName,
      "--resource-id",
      input.resourceId,
      "--resource-name",
      input.resourceName,
      "--rule",
      input.rule,
    ];

    if (input.copyrightNote) {
      scriptArgs.push("--copyright-note", input.copyrightNote);
    }

    if (input.clean ?? true) {
      scriptArgs.push("--clean");
    }

    const proc = spawn(UV_BIN, scriptArgs, {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        UV_PROJECT: PROJECT_ROOT,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            stderr ||
              stdout ||
              `Asset importer failed with exit code ${code}`,
          ),
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(
          new Error(
            `Asset importer JSON parse failed.\n\nSTDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`,
          ),
        );
      }
    });
  });
}

export async function GET(req: NextRequest) {
  const productSlug = slugify(
    req.nextUrl.searchParams.get("productSlug") ??
      req.nextUrl.searchParams.get("product") ??
      "sony-wh-1000xm6",
  );

  const product = await readProduct(productSlug);

  return NextResponse.json(product);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const productName = String(body.productName ?? "Sony WH-1000XM6");
    const productSlug = slugify(String(body.productSlug ?? productName));

    const resourceName = String(body.resourceName ?? "Default Resource");
    const resourceId = slugify(String(body.resourceId ?? resourceName));

    const sourceUrl = String(body.sourceUrl ?? "");
    const rule = String(body.rule ?? "generic");
    const copyrightNote = String(body.copyrightNote ?? "");
    const clean = body.clean === undefined ? true : Boolean(body.clean);

    if (!sourceUrl) {
      return NextResponse.json(
        { error: "sourceUrl이 없습니다." },
        { status: 400 },
      );
    }

    const result = await runImporter({
      productSlug,
      productName,
      resourceId,
      resourceName,
      sourceUrl,
      rule,
      copyrightNote,
      clean,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err.message ?? "Asset import 실패",
      },
      { status: 500 },
    );
  }
}
