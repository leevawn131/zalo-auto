import type { API } from "zca-js";
import { prisma } from "../../config/database.js";
import { logger } from "../../config/logger.js";

export interface GroupMetaInfo {
  name: string;
  avatar?: string | null;
  totalMember?: number | null;
}

export class GroupManagerService {
  /**
   * Sync all groups for an active account using Zalo API
   */
  public async syncAccountGroups(accountId: string, api: API): Promise<void> {
    try {
      if (!api || typeof api.getAllGroups !== "function") {
        return;
      }

      logger.info({ accountId }, "Starting group metadata synchronization...");
      const groupsRes = await api.getAllGroups();
      const groupMap = groupsRes?.gridVerMap || {};
      const groupIds = Object.keys(groupMap);

      if (groupIds.length === 0) {
        logger.info({ accountId }, "No groups found for account");
        return;
      }

      logger.info({ accountId, groupCount: groupIds.length }, "Discovered groups, fetching group details...");

      // Process in batches of 20 to avoid exceeding payload limits
      const BATCH_SIZE = 20;
      for (let i = 0; i < groupIds.length; i += BATCH_SIZE) {
        const batch = groupIds.slice(i, i + BATCH_SIZE);
        try {
          if (typeof api.getGroupInfo !== "function") break;
          const infoRes = await api.getGroupInfo(batch);
          const gridInfoMap = infoRes?.gridInfoMap || {};

          for (const [groupId, info] of Object.entries(gridInfoMap)) {
            if (!info) continue;
            const groupName = info.name?.trim() || "";
            const avatar = info.avt || info.fullAvt || null;
            const totalMember = typeof info.totalMember === "number" ? info.totalMember : null;

            await prisma.groupMetadata.upsert({
              where: {
                accountId_groupId: {
                  accountId,
                  groupId,
                },
              },
              create: {
                accountId,
                groupId,
                name: groupName || `Nhóm ${groupId.slice(-4)}`,
                avatar,
                totalMember,
              },
              update: {
                name: groupName || undefined,
                avatar: avatar || undefined,
                totalMember: totalMember !== null ? totalMember : undefined,
              },
            });
          }
        } catch (batchErr) {
          logger.warn({ accountId, batch, err: batchErr }, "Failed to fetch details for group batch");
        }
      }

      logger.info({ accountId }, "Group metadata synchronization finished successfully");
    } catch (err) {
      logger.warn({ accountId, err }, "Failed to sync account groups");
    }
  }

  /**
   * Ensure a specific group's info is cached in DB, fetching on-demand if needed
   */
  public async ensureGroupCached(
    accountId: string,
    groupId: string,
    api?: API
  ): Promise<GroupMetaInfo | null> {
    try {
      const existing = await prisma.groupMetadata.findUnique({
        where: {
          accountId_groupId: {
            accountId,
            groupId,
          },
        },
      });

      // If exists and updated within the last 12 hours, use cached
      const STALE_MS = 12 * 60 * 60 * 1000;
      if (existing && existing.name && Date.now() - existing.updatedAt.getTime() < STALE_MS) {
        return {
          name: existing.name,
          avatar: existing.avatar,
          totalMember: existing.totalMember,
        };
      }

      // If API is available, fetch latest from Zalo
      if (api && typeof api.getGroupInfo === "function") {
        const res = await api.getGroupInfo(groupId);
        const info = res?.gridInfoMap?.[groupId];
        if (info) {
          const name = info.name?.trim() || existing?.name || `Nhóm ${groupId.slice(-4)}`;
          const avatar = info.avt || info.fullAvt || existing?.avatar || null;
          const totalMember = typeof info.totalMember === "number" ? info.totalMember : existing?.totalMember;

          const saved = await prisma.groupMetadata.upsert({
            where: {
              accountId_groupId: {
                accountId,
                groupId,
              },
            },
            create: {
              accountId,
              groupId,
              name,
              avatar,
              totalMember,
            },
            update: {
              name,
              avatar,
              totalMember,
            },
          });

          return {
            name: saved.name,
            avatar: saved.avatar,
            totalMember: saved.totalMember,
          };
        }
      }

      if (existing) {
        return {
          name: existing.name,
          avatar: existing.avatar,
          totalMember: existing.totalMember,
        };
      }

      return null;
    } catch (err) {
      logger.debug({ accountId, groupId, err }, "ensureGroupCached error");
      return null;
    }
  }

  /**
   * Batch resolve group metadata for thread listings
   */
  public async getGroupNames(
    accountId: string,
    groupIds: string[],
    api?: API
  ): Promise<Map<string, GroupMetaInfo>> {
    const result = new Map<string, GroupMetaInfo>();
    if (groupIds.length === 0) return result;

    try {
      // 1. Fetch from DB
      const existingMetas = await prisma.groupMetadata.findMany({
        where: {
          accountId,
          groupId: { in: groupIds },
        },
      });

      const missingIds: string[] = [];
      const foundSet = new Set<string>();

      for (const meta of existingMetas) {
        foundSet.add(meta.groupId);
        result.set(meta.groupId, {
          name: meta.name,
          avatar: meta.avatar,
          totalMember: meta.totalMember,
        });
      }

      for (const id of groupIds) {
        if (!foundSet.has(id)) {
          missingIds.push(id);
        }
      }

      // 2. Fetch missing groups on-the-fly if online API is available
      if (missingIds.length > 0 && api && typeof api.getGroupInfo === "function") {
        try {
          const res = await api.getGroupInfo(missingIds);
          const gridInfoMap = res?.gridInfoMap || {};

          for (const [groupId, info] of Object.entries(gridInfoMap)) {
            if (!info) continue;
            const name = info.name?.trim() || `Nhóm ${groupId.slice(-4)}`;
            const avatar = info.avt || info.fullAvt || null;
            const totalMember = typeof info.totalMember === "number" ? info.totalMember : null;

            result.set(groupId, { name, avatar, totalMember });

            // Save in DB asynchronously
            void prisma.groupMetadata.upsert({
              where: {
                accountId_groupId: {
                  accountId,
                  groupId,
                },
              },
              create: {
                accountId,
                groupId,
                name,
                avatar,
                totalMember,
              },
              update: {
                name,
                avatar,
                totalMember,
              },
            }).catch(() => {});
          }
        } catch (apiErr) {
          logger.warn({ accountId, missingIds, err: apiErr }, "Failed on-the-fly getGroupInfo");
        }
      }
    } catch (err) {
      logger.warn({ accountId, err }, "Failed getGroupNames");
    }

    return result;
  }
}

export const groupManager = new GroupManagerService();
