import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  ApplyToBountyParams,
  ApplyToBountyResponse,
  CreateBountyBody,
  CreateBountyResponse,
  CreatePostBody,
  CreatePostResponse,
  CreateProjectBody,
  CreateProjectResponse,
  CreateServiceBody,
  CreateServiceResponse,
  LikePostParams,
  LikePostResponse,
  ListAgentsResponse,
  ListBountiesResponse,
  ListFeedResponse,
  ListProjectsResponse,
  ListServicesResponse,
  StarProjectParams,
  StarProjectResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import {
  agentsTable,
  bountiesTable,
  feedPostsTable,
  projectsTable,
  servicesTable,
} from "@workspace/db";

const router: IRouter = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Sign in to publish to GitAI." });
    return;
  }
  next();
};

function memberLabel(req: Parameters<typeof getAuth>[0]): string {
  const userId = getAuth(req).userId;
  return userId ? `Member ${userId.slice(-6)}` : "GitAI member";
}

router.get("/gitai/feed", async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(feedPostsTable)
    .orderBy(desc(feedPostsTable.createdAt), desc(feedPostsTable.id));
  res.json(ListFeedResponse.parse(posts));
});

router.post("/gitai/feed", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .insert(feedPostsTable)
    .values({
      authorName: memberLabel(req),
      authorKind: parsed.data.authorKind ?? "human",
      body: parsed.data.body,
      tags: parsed.data.tags ?? [],
    })
    .returning();
  res.status(201).json(CreatePostResponse.parse(post));
});

router.post("/gitai/feed/:id/like", async (req, res): Promise<void> => {
  const params = LikePostParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [post] = await db
    .update(feedPostsTable)
    .set({ likes: sql`${feedPostsTable.likes} + 1` })
    .where(eq(feedPostsTable.id, params.data.id))
    .returning();
  if (!post) {
    res.status(404).json({ error: "Post not found" });
    return;
  }
  res.json(LikePostResponse.parse(post));
});

router.get("/gitai/agents", async (_req, res): Promise<void> => {
  const agents = await db.select().from(agentsTable).orderBy(desc(agentsTable.stars));
  res.json(ListAgentsResponse.parse(agents));
});

router.get("/gitai/projects", async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.updatedAt), desc(projectsTable.id));
  res.json(ListProjectsResponse.parse(projects));
});

router.post("/gitai/projects", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [project] = await db
    .insert(projectsTable)
    .values({
      title: parsed.data.title,
      description: parsed.data.description,
      language: parsed.data.language,
      tags: [],
      stars: 0,
      authorName: memberLabel(req),
      repoUrl: parsed.data.repoUrl ?? null,
    })
    .returning();
  res.status(201).json(CreateProjectResponse.parse(project));
});

router.post("/gitai/projects/:id/star", async (req, res): Promise<void> => {
  const params = StarProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [project] = await db
    .update(projectsTable)
    .set({ stars: sql`${projectsTable.stars} + 1` })
    .where(eq(projectsTable.id, params.data.id))
    .returning();
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(StarProjectResponse.parse(project));
});

router.get("/gitai/bounties", async (_req, res): Promise<void> => {
  const bounties = await db
    .select()
    .from(bountiesTable)
    .orderBy(desc(bountiesTable.createdAt), desc(bountiesTable.id));
  res.json(ListBountiesResponse.parse(bounties));
});

router.post("/gitai/bounties", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateBountyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [bounty] = await db
    .insert(bountiesTable)
    .values({
      ...parsed.data,
      postedBy: memberLabel(req),
      status: "open",
      applicants: 0,
    })
    .returning();
  res.status(201).json(CreateBountyResponse.parse(bounty));
});

router.post("/gitai/bounties/:id/apply", async (req, res): Promise<void> => {
  const params = ApplyToBountyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [bounty] = await db
    .update(bountiesTable)
    .set({ applicants: sql`${bountiesTable.applicants} + 1` })
    .where(and(eq(bountiesTable.id, params.data.id), eq(bountiesTable.status, "open")))
    .returning();
  if (!bounty) {
    res.status(404).json({ error: "Open bounty not found" });
    return;
  }
  res.json(ApplyToBountyResponse.parse(bounty));
});

router.get("/gitai/services", async (_req, res): Promise<void> => {
  const services = await db.select().from(servicesTable).orderBy(asc(servicesTable.title));
  res.json(ListServicesResponse.parse(services));
});

router.post("/gitai/services", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const priceSol = parsed.data.priceSol?.trim() || null;
  const sellerWallet = parsed.data.sellerWallet?.trim() || null;
  if (priceSol && (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(priceSol) || Number(priceSol) <= 0)) {
    res.status(400).json({ error: "Enter a positive SOL amount with up to 9 decimal places." });
    return;
  }
  if (sellerWallet && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(sellerWallet)) {
    res.status(400).json({ error: "Enter a valid Solana public wallet address." });
    return;
  }
  if (Boolean(priceSol) !== Boolean(sellerWallet)) {
    res.status(400).json({ error: "SOL-priced listings need both a price and a seller wallet." });
    return;
  }
  const [service] = await db
    .insert(servicesTable)
    .values({
      ...parsed.data,
      priceSol,
      sellerWallet,
      sellerKind: parsed.data.sellerKind ?? "human",
      provider: memberLabel(req),
    })
    .returning();
  res.status(201).json(CreateServiceResponse.parse(service));
});

router.get("/gitai/payments/status", (_req, res): void => {
  const configured = {
    feeWallet: Boolean(process.env.GITAI_FEE_WALLET_ADDRESS?.trim()),
    tokenMint: Boolean(process.env.GITAI_MEME_TOKEN_MINT?.trim()),
    stakingProgram: Boolean(process.env.GITAI_STAKING_PROGRAM_ID?.trim()),
  };
  const blockers = [
    ...(!configured.feeWallet ? ["The public fee wallet has not been configured."] : []),
    ...(!configured.tokenMint ? ["The meme-coin mint has not been configured."] : []),
    ...(!configured.stakingProgram ? ["The 30-day seller lock program has not been deployed and audited."] : []),
    "The live checkout transaction path has not been activated and reviewed.",
  ];
  res.json({
    fees: { buyerPercent: 4, sellerPercent: 4, totalPercent: 8 },
    sellerStake: { percentOfGrossSale: 5, token: "GitAI meme coin", lockDays: 30 },
    settlement: "direct",
    feesOnTransfersOrCashOuts: false,
    configured,
    checkoutEnabled: false,
    blockers,
  });
});

router.get("/gitai/github/repository", async (req, res): Promise<void> => {
  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    res.status(400).json({ error: "Enter a public GitHub repository URL." });
    return;
  }

  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname.toLowerCase() !== "github.com" ||
    pathParts.length !== 2 ||
    !pathParts.every((part) => /^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    res.status(400).json({ error: "Use a URL like https://github.com/owner/repository." });
    return;
  }

  const [owner, rawRepository] = pathParts;
  const repository = rawRepository.replace(/\.git$/i, "");
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "GitAI-public-repository-import",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!response.ok) {
      res.status(response.status === 404 ? 404 : 502).json({
        error:
          response.status === 404
            ? "That repository is not publicly available."
            : "GitHub could not return this repository right now.",
      });
      return;
    }
    const repo = (await response.json()) as {
      full_name?: string;
      html_url?: string;
      description?: string | null;
      language?: string | null;
      stargazers_count?: number;
      forks_count?: number;
      updated_at?: string;
    };
    res.json({
      fullName: repo.full_name ?? `${owner}/${repository}`,
      htmlUrl: repo.html_url ?? `https://github.com/${owner}/${repository}`,
      description: repo.description ?? "",
      language: repo.language ?? "Unknown",
      stars: repo.stargazers_count ?? 0,
      forks: repo.forks_count ?? 0,
      updatedAt: repo.updated_at ?? null,
    });
  } catch {
    res.status(502).json({ error: "GitHub lookup timed out. Please try again." });
  }
});

export default router;
