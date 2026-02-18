import { randomBytes, scryptSync } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const hashPassword = (plain) => {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(String(plain), salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
};

const createDefaultPermissions = () => ({
  allowNewUserBooking: true,
  newUserLimit: -1,
  newUserQuota: -1,
  allowPlatinumBooking: false,
  platinumLimit: 0,
  platinumQuota: 0,
  allowCorporateBooking: false,
  corporateLimit: 0,
  corporateQuota: 0,
  allowedCorporateNames: [],
  corporateSpecificLimits: {},
  corporateSpecificQuotas: {}
});

const seed = async () => {
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      id: "u_admin",
      username: "admin",
      name: "系统管理员",
      password: hashPassword("123456"),
      role: "ADMIN",
      status: "ACTIVE",
      permissions: {
        ...createDefaultPermissions(),
        allowPlatinumBooking: true,
        platinumLimit: -1,
        platinumQuota: -1,
        allowCorporateBooking: true,
        corporateLimit: -1,
        corporateQuota: -1
      },
      approvedAt: new Date("2026-01-01T00:00:00.000Z")
    }
  });

  await prisma.user.upsert({
    where: { username: "demo" },
    update: {},
    create: {
      id: "u_demo",
      username: "demo",
      name: "演示用户",
      password: hashPassword("123456"),
      role: "USER",
      status: "ACTIVE",
      permissions: createDefaultPermissions(),
      approvedAt: new Date("2026-01-10T00:00:00.000Z")
    }
  });

  const poolCount = await prisma.poolAccount.count();
  if (poolCount === 0) {
    await prisma.poolAccount.create({
      data: {
        id: "pool_001",
        phone: "13800000001",
        loginTokenCipher: "",
        remark: "演示账号",
        isOnline: true,
        isPlatinum: false,
        isNewUser: true,
        corporateAgreements: [],
        points: 1200,
        breakfastCoupons: 1,
        roomUpgradeCoupons: 0,
        lateCheckoutCoupons: 0,
        slippersCoupons: 0,
        dailyOrdersLeft: 5,
        lastExecution: {},
        lastResult: {}
      }
    });
  }

  const blacklistCount = await prisma.blacklistRecord.count();
  if (blacklistCount === 0) {
    await prisma.blacklistRecord.createMany({
      data: [
        {
          id: "bl_001",
          chainId: "ATOUR",
          hotelName: "上海人民广场大世界地铁站亚朵酒店",
          severity: "MEDIUM",
          reason: "前台态度极差，拒绝查单，且卫生间有异味。",
          tags: ["态度恶劣", "卫生差"],
          status: "ACTIVE",
          reportedBy: "Agent-007",
          reporterId: "u_admin",
          source: "manual",
          date: "2023-10-05"
        },
        {
          id: "bl_002",
          chainId: "UNKNOWN",
          hotelName: "北京某快捷酒店",
          severity: "HIGH",
          reason: "虚假宣传，无窗房当有窗卖，客户投诉退款难。",
          tags: ["虚假宣传", "退款难"],
          status: "ACTIVE",
          reportedBy: "Agent-Alice",
          reporterId: "u_demo",
          source: "manual",
          date: "2023-09-15"
        }
      ]
    });
  }

  const config = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    await prisma.systemConfig.create({
      data: {
        id: "default",
        siteName: "SkyHotel Agent Pro",
        supportContact: "400-888-9999",
        maintenanceMode: false,
        maintenanceMessage: "系统升级中，预计1小时后恢复。",
        enableNewUser: true,
        enablePlatinum: true,
        enableCorporate: true,
        disabledCorporateNames: ["某某科技 (风控中)", "旧协议单位"],
        proxies: {
          create: [
            {
              id: "proxy-001",
              ip: "192.168.1.101",
              port: 8080,
              type: "DYNAMIC",
              status: "ONLINE",
              location: "上海",
              failCount: 0
            },
            {
              id: "proxy-002",
              ip: "10.0.0.55",
              port: 3128,
              type: "STATIC",
              status: "ONLINE",
              location: "北京",
              failCount: 0
            },
            {
              id: "proxy-003",
              ip: "47.100.22.33",
              port: 8888,
              type: "DYNAMIC",
              status: "OFFLINE",
              location: "广州",
              failCount: 3
            }
          ]
        },
        llmModels: {
          create: [
            {
              id: "llm-gemini-main",
              name: "Gemini 主模型",
              provider: "GEMINI",
              modelId: "gemini-2.5-flash",
              apiKey: "",
              systemPrompt: "你是专业的酒店预订助手，输出简洁、结构化。",
              baseUrl: "",
              temperature: 0.2,
              maxTokens: 1024,
              isActive: true
            },
            {
              id: "llm-openai-backup",
              name: "OpenAI 备用模型",
              provider: "OPENAI",
              modelId: "gpt-4o-mini",
              apiKey: "",
              systemPrompt: "",
              baseUrl: "",
              temperature: 0.2,
              maxTokens: 1024,
              isActive: false
            }
          ]
        }
      }
    });
  }

  const orderGroupCount = await prisma.orderGroup.count();
  if (orderGroupCount === 0) {
    const sampleGroup = await prisma.orderGroup.create({
      data: {
        bizOrderNo: `BIZ-${Date.now()}`,
        chainId: "ATOUR",
        hotelName: "上海静安亚朵S酒店",
        customerName: "张三",
        contactPhone: "13800000000",
        checkInDate: new Date("2026-02-20"),
        checkOutDate: new Date("2026-02-22"),
        totalNights: 2,
        totalAmount: 1098,
        status: "PROCESSING",
        paymentStatus: "PARTIAL",
        creatorId: "u_admin",
        creatorName: "系统管理员",
        remark: "演示拆单"
      }
    });

    const itemA = await prisma.orderItem.create({
      data: {
        groupId: sampleGroup.id,
        atourOrderId: `AT-${Date.now()}-1`,
        roomType: "高级大床房",
        roomCount: 1,
        accountId: "pool_001",
        accountPhone: "13800000001",
        checkInDate: new Date("2026-02-20"),
        checkOutDate: new Date("2026-02-22"),
        amount: 549,
        status: "CONFIRMED",
        paymentStatus: "PAID",
        executionStatus: "DONE",
        splitIndex: 1,
        splitTotal: 2
      }
    });

    const itemB = await prisma.orderItem.create({
      data: {
        groupId: sampleGroup.id,
        atourOrderId: `AT-${Date.now()}-2`,
        roomType: "高级大床房",
        roomCount: 1,
        checkInDate: new Date("2026-02-20"),
        checkOutDate: new Date("2026-02-22"),
        amount: 549,
        status: "PROCESSING",
        paymentStatus: "UNPAID",
        executionStatus: "QUEUED",
        splitIndex: 2,
        splitTotal: 2
      }
    });

    await prisma.task.createMany({
      data: [
        {
          orderItemId: itemA.id,
          state: "completed",
          progress: 100,
          result: { ok: true, message: "sample completed" }
        },
        {
          orderItemId: itemB.id,
          state: "waiting",
          progress: 0
        }
      ]
    });
  }
};

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
