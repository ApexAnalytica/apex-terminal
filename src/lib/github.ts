const GH_API = "https://api.github.com";

function headers(): HeadersInit {
  const token = process.env.GITHUB_PIPELINE_TOKEN;
  if (!token) throw new Error("GITHUB_PIPELINE_TOKEN not set");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

function repo(): { owner: string; name: string } {
  const slug = process.env.GITHUB_PIPELINE_REPO;
  if (!slug || !slug.includes("/")) {
    throw new Error(
      "GITHUB_PIPELINE_REPO not set (expected format: owner/repo)",
    );
  }
  const [owner, name] = slug.split("/");
  return { owner, name };
}

export type CreatedIssue = {
  url: string;
  number: number;
};

export async function createFeedbackIssue(args: {
  feedbackId: number;
  type: string;
  message: string;
  adminNotes: string | null;
  submitterEmail: string | null;
}): Promise<CreatedIssue> {
  const { owner, name } = repo();

  const title = `[feedback #${args.feedbackId}] ${args.type}: ${args.message
    .slice(0, 70)
    .replace(/\s+/g, " ")
    .trim()}${args.message.length > 70 ? "…" : ""}`;

  const body = [
    `**Feedback-ID:** ${args.feedbackId}`,
    `**Type:** ${args.type}`,
    args.submitterEmail ? `**Submitter:** ${args.submitterEmail}` : null,
    "",
    "## Request",
    "",
    args.message,
    "",
    args.adminNotes ? "## Admin notes" : null,
    args.adminNotes ? "" : null,
    args.adminNotes,
    "",
    "## Agent instructions",
    "",
    "Implement the request above. When opening the PR, include the commit trailer:",
    "",
    "```",
    `Feedback-ID: ${args.feedbackId}`,
    "```",
    "",
    "This trailer is required — the production pipeline uses it to link the PR back to this feedback row.",
  ]
    .filter((l) => l !== null)
    .join("\n");

  const res = await fetch(`${GH_API}/repos/${owner}/${name}/issues`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      title,
      body,
      labels: ["feedback-approved"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub issue creation failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as { html_url: string; number: number };
  return { url: json.html_url, number: json.number };
}
