import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "../../../config/database.js";
import { GroupManagerService } from "../group-manager.service.js";

describe("GroupManagerService", () => {
  let service: GroupManagerService;
  const accountId = "acc_test_group_mgr";

  beforeEach(async () => {
    service = new GroupManagerService();
    await prisma.groupMetadata.deleteMany({});
  });

  afterAll(async () => {
    await prisma.groupMetadata.deleteMany({});
  });

  it("syncAccountGroups should fetch all groups and persist their names in groupMetadata", async () => {
    const mockApi = {
      getAllGroups: vi.fn().mockResolvedValue({
        gridVerMap: {
          group_111: "ver_1",
          group_222: "ver_2",
        },
      }),
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: {
          group_111: {
            groupId: "group_111",
            name: "AE gà gà",
            avt: "https://avatar.com/111.jpg",
            totalMember: 12,
          },
          group_222: {
            groupId: "group_222",
            name: "Team Dự Án ABC",
            avt: "https://avatar.com/222.jpg",
            totalMember: 5,
          },
        },
      }),
    };

    await service.syncAccountGroups(accountId, mockApi as never);

    const saved = await prisma.groupMetadata.findMany({
      where: { accountId },
      orderBy: { groupId: "asc" },
    });

    expect(saved).toHaveLength(2);
    expect(saved[0].groupId).toBe("group_111");
    expect(saved[0].name).toBe("AE gà gà");
    expect(saved[0].avatar).toBe("https://avatar.com/111.jpg");
    expect(saved[0].totalMember).toBe(12);

    expect(saved[1].groupId).toBe("group_222");
    expect(saved[1].name).toBe("Team Dự Án ABC");
  });

  it("getGroupNames should return cached names and fetch missing ones from API", async () => {
    // Pre-insert group_111
    await prisma.groupMetadata.create({
      data: {
        accountId,
        groupId: "group_111",
        name: "AE gà gà",
      },
    });

    const mockApi = {
      getGroupInfo: vi.fn().mockResolvedValue({
        gridInfoMap: {
          group_333: {
            groupId: "group_333",
            name: "Gia đình",
            avt: "https://avatar.com/333.jpg",
            totalMember: 4,
          },
        },
      }),
    };

    const result = await service.getGroupNames(accountId, ["group_111", "group_333"], mockApi as never);

    expect(result.get("group_111")?.name).toBe("AE gà gà");
    expect(result.get("group_333")?.name).toBe("Gia đình");
    expect(mockApi.getGroupInfo).toHaveBeenCalledWith(["group_333"]);
  });

  it("ensureGroupCached should return cached metadata if available", async () => {
    await prisma.groupMetadata.create({
      data: {
        accountId,
        groupId: "group_abc",
        name: "Hội Đá Bóng",
      },
    });

    const mockApi = {
      getGroupInfo: vi.fn(),
    };

    const res = await service.ensureGroupCached(accountId, "group_abc", mockApi as never);
    expect(res?.name).toBe("Hội Đá Bóng");
    expect(mockApi.getGroupInfo).not.toHaveBeenCalled();
  });
});
