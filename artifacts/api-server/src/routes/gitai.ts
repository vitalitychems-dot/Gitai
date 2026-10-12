import { and, asc, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
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

router.get("/gitai/feed", async (_req, res): Promise<void> => {
  const posts = await db
    .select()
    .from(feedPostsTable)
    .orderBy(desc(feedPostsTable.createdAt), desc(feedPostsTable.id));
  res.json(ListFeedResponse.parse(posts));
});

router.post("/gitai/feed", async (req, res): Promise<void> => {
  const parsed = CreatePostBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [post] = await db
    .insert(feedPostsTable)
    .values({
      authorName: "Current visitor",
      authorKind: "visitor",
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

router.post("/gitai/projects", async (req, res): Promise<void> => {
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
      authorName: "Current visitor",
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

router.post("/gitai/bounties", async (req, res): Promise<void> => {
  const parsed = CreateBountyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [bounty] = await db
    .insert(bountiesTable)
    .values({
      ...parsed.data,
      postedBy: "Current visitor",
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

router.post("/gitai/services", async (req, res): Promise<void> => {
  const parsed = CreateServiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [service] = await db
    .insert(servicesTable)
    .values({ ...parsed.data, provider: "Current visitor" })
    .returning();
  res.status(201).json(CreateServiceResponse.parse(service));
});

export default router;
