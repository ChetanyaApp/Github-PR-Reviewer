import { execSync } from "node:child_process";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER;
const BASE_SHA = process.env.BASE_SHA;
const HEAD_SHA = process.env.HEAD_SHA;

const MODEL = "gemini-3.8-flash";
const COMMENT_MARKER = "<!-- RN-AI-REVIEW-BOT -->";

function getFilteredDiff() {
  try {
    const diff = execSync(
      `git diff ${BASE_SHA} ${HEAD_SHA} -- '*.ts' '*.tsx' '*.js' '*.jsx' ':!*.test.*' ':!*.spec.*'`,
      { encoding: "utf-8", maxBuffer: 1024 * 1024 * 5 },
    );
    return diff.slice(0, 20000);
  } catch (err) {
    console.error("Failed to get git diff:", err.message);
    return "";
  }
}

async function reviewWithGemini(diff) {
  const systemInstruction = `
You are a Senior React Native Engineer reviewing a Pull Request.
Review ONLY added/modified lines (+). Skip minor formatting nitpicks.

Check specifically for:
1. FlashList / FlatList performance (inline functions/styles in renderItem or keyExtractor, missing React.memo on row components, missing estimatedItemSize).
2. Reanimated / Gesture Handler rules (mutating React state inside gesture/worklet callbacks instead of SharedValues, heavy JS-thread work).
3. React hooks & memory leaks (missing useEffect cleanup, missing request cancellation).
4. Crash & runtime safety (unsafe JSON.parse, unguarded nullable access, missing error handling).

Format in Markdown:
- If no issues are found: "✅ **LGTM!** No React Native performance, lifecycle, or crash risks found."
- Otherwise group under **🔴 Critical**, **🟡 Performance**, and **🔵 Suggestion** with file/context, why it matters, and a short fix snippet.
Keep it under 400 words.
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Review this React Native PR diff:\n\n\`\`\`diff\n${diff}\n\`\`\``,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("\n")
    .trim();

  return text || "No review generated.";
}

async function upsertPRComment(reviewBody) {
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const url = `https://api.github.com/repos/${REPO}/issues/${PR_NUMBER}/comments`;
  const listRes = await fetch(url, { headers });
  const comments = await listRes.json();

  const existing = Array.isArray(comments)
    ? comments.find(
        (c) => typeof c.body === "string" && c.body.includes(COMMENT_MARKER),
      )
    : null;

  const body = [
    COMMENT_MARKER,
    "### 🤖 Automated React Native PR Review",
    "",
    reviewBody,
    "",
    "---",
    "*Powered by Gemini API (Free Tier) & GitHub Actions — Zero infrastructure cost.*",
  ].join("\n");

  if (existing) {
    await fetch(
      `https://api.github.com/repos/${REPO}/issues/comments/${existing.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      },
    );
    console.log("Updated existing PR review comment.");
  } else {
    await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    });
    console.log("Created new PR review comment.");
  }
}

async function main() {
  if (
    !GEMINI_API_KEY ||
    !GITHUB_TOKEN ||
    !REPO ||
    !PR_NUMBER ||
    !BASE_SHA ||
    !HEAD_SHA
  ) {
    throw new Error("Missing required environment variables.");
  }

  const diff = getFilteredDiff();
  if (!diff.trim()) {
    console.log("No matching RN source changes in diff. Skipping.");
    return;
  }

  const review = await reviewWithGemini(diff);
  await upsertPRComment(review);
}

main().catch((err) => {
  console.error("PR Reviewer error:", err);
  // Exit 0 so external API rate limits or outages never block PR merges
  process.exit(0);
});
