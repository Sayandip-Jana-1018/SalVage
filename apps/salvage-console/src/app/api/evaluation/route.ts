import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { ApiResult } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Serve the evaluation results produced by `make eval`.
 *
 * The file is written by `salvage-eval report --json`, from the same summary
 * objects that render EVALUATION.md. Reading it rather than recomputing means
 * the console cannot disagree with the committed report, and cannot show a
 * result that no run produced.
 *
 * When the file is absent the answer is "the harness has not been run", not a
 * set of example numbers.
 */
const RESULTS_PATH =
  process.env.EVALUATION_RESULTS_PATH ??
  path.join(process.cwd(), "..", "..", "docs", "evaluation-results.json");

export async function GET(): Promise<NextResponse<ApiResult<unknown>>> {
  try {
    const raw = await readFile(RESULTS_PATH, "utf-8");
    return NextResponse.json({ ok: true, data: JSON.parse(raw) });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No evaluation results found. Run `make eval` to generate them; the harness writes docs/evaluation-results.json alongside EVALUATION.md.",
      },
      { status: 404 },
    );
  }
}
