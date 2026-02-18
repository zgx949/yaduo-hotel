import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { decryptPoolToken, encryptPoolToken } from "../services/token-crypto.service.js";
import { prisma } from "../lib/prisma.js";

const now = () => new Date().toISOString();

const hashPassword = (plain) => {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(String(plain), salt, 64).toString("hex");
  return `scrypt$${salt}$${digest}`;
};

const verifyPassword = (plain, encoded) => {
  if (!encoded || !encoded.startsWith("scrypt$")) {
    return false;
  }
  const [, salt, digest] = encoded.split("$");
  if (!salt || !digest) {
    return false;
  }
  const computed = scryptSync(String(plain), salt, 64);
  const stored = Buffer.from(digest, "hex");
  if (computed.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(computed, stored);
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

const normalizePermissions = (patch = {}, existing = createDefaultPermissions()) => ({
  ...existing,
  ...patch,
  allowedCorporateNames: Array.isArray(patch.allowedCorporateNames)
    ? patch.allowedCorporateNames.map((it) => String(it).trim()).filter(Boolean)
    : existing.allowedCorporateNames,
  corporateSpecificLimits: {
    ...existing.corporateSpecificLimits,
    ...(patch.corporateSpecificLimits || {})
  },
  corporateSpecificQuotas: {
    ...existing.corporateSpecificQuotas,
    ...(patch.corporateSpecificQuotas || {})
  }
});

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const asNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isNaN(num) ? fallback : num;
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const normalizeCorporateBindings = (input = [], existing = []) => {
  const source = Array.isArray(input) ? input : existing;
  const seen = new Set();
  const output = [];

  source.forEach((item) => {
    const name = typeof item === "string" ? item.trim() : String(item?.name || "").trim();
    if (!name || seen.has(name)) {
      return;
    }
    seen.add(name);
    output.push({
      id: typeof item === "object" && item?.id ? String(item.id) : `corp_${randomUUID().slice(0, 8)}`,
      name,
      enabled: typeof item === "object" && hasOwn(item, "enabled") ? Boolean(item.enabled) : true
    });
  });

  return output;
};

const deriveTier = (account) => {
  if (account.corporateAgreements.length > 0) {
    return "CORPORATE";
  }
  if (account.isPlatinum) {
    return "PLATINUM";
  }
  if (account.isNewUser) {
    return "NEW_USER";
  }
  return "NORMAL";
};

const canUseTier = (account, tier) => {
  if (!tier) {
    return true;
  }
  if (tier === "NEW_USER") {
    return Boolean(account.isNewUser);
  }
  if (tier === "PLATINUM") {
    return Boolean(account.isPlatinum);
  }
  if (tier === "CORPORATE") {
    return account.corporateAgreements.length > 0;
  }
  return true;
};

const projectPoolAccount = (entity) => {
  const tier = deriveTier(entity);
  const status = entity.isOnline ? "ACTIVE" : "OFFLINE";
  const corporateNames = entity.corporateAgreements.map((it) => it.name);

  return {
    id: entity.id,
    phone: entity.phone,
    token: "",
    token_configured: Boolean(entity.loginTokenCipher),
    is_online: entity.isOnline,
    remark: entity.remark || null,
    is_platinum: entity.isPlatinum,
    is_corp_user: entity.corporateAgreements.length > 0,
    is_new_user: entity.isNewUser,
    corporate_agreements: entity.corporateAgreements,
    corporateName: corporateNames[0],
    breakfast_coupons: entity.breakfastCoupons,
    room_upgrade_coupons: entity.roomUpgradeCoupons,
    late_checkout_coupons: entity.lateCheckoutCoupons,
    tier,
    status,
    points: entity.points,
    coupons: {
      breakfast: entity.breakfastCoupons,
      upgrade: entity.roomUpgradeCoupons,
      lateCheckout: entity.lateCheckoutCoupons,
      slippers: entity.slippersCoupons
    },
    dailyOrdersLeft: entity.dailyOrdersLeft,
    lastExecution: entity.lastExecution,
    lastResult: entity.lastResult,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
};

const normalizeProxyPayload = (payload = {}, existing = null) => {
  const base = existing
    ? clone(existing)
    : {
      id: `proxy-${randomUUID().slice(0, 8)}`,
      ip: "",
      port: 0,
      type: "DYNAMIC",
      status: "OFFLINE",
      lastChecked: now(),
      location: "",
      failCount: 0
    };

  if (hasOwn(payload, "ip")) {
    base.ip = String(payload.ip || "").trim();
  }
  if (hasOwn(payload, "port")) {
    base.port = Math.max(0, asNumber(payload.port, 0));
  }
  if (hasOwn(payload, "type")) {
    base.type = String(payload.type || "").toUpperCase() === "STATIC" ? "STATIC" : "DYNAMIC";
  }
  if (hasOwn(payload, "status")) {
    const nextStatus = String(payload.status || "").toUpperCase();
    base.status = ["ONLINE", "OFFLINE", "LATENCY"].includes(nextStatus) ? nextStatus : "OFFLINE";
  }
  if (hasOwn(payload, "location")) {
    base.location = String(payload.location || "").trim();
  }
  if (hasOwn(payload, "failCount")) {
    base.failCount = Math.max(0, asNumber(payload.failCount, 0));
  }
  base.lastChecked = now();
  return base;
};

const normalizeLlmModel = (item = {}, existing = null) => {
  const base = existing
    ? clone(existing)
    : {
      id: `llm-${randomUUID().slice(0, 8)}`,
      name: "",
      provider: "OPENAI",
      modelId: "",
      apiKey: "",
      systemPrompt: "",
      baseUrl: "",
      temperature: 0.2,
      maxTokens: 1024,
      isActive: false
    };

  if (hasOwn(item, "name")) {
    base.name = String(item.name || "").trim();
  }
  if (hasOwn(item, "provider")) {
    const provider = String(item.provider || "").toUpperCase();
    base.provider = ["GEMINI", "OPENAI", "CLAUDE"].includes(provider) ? provider : "OPENAI";
  }
  if (hasOwn(item, "modelId")) {
    base.modelId = String(item.modelId || "").trim();
  }
  if (hasOwn(item, "apiKey")) {
    base.apiKey = String(item.apiKey || "").trim();
  }
  if (hasOwn(item, "systemPrompt")) {
    base.systemPrompt = String(item.systemPrompt || "").trim();
  }
  if (hasOwn(item, "baseUrl")) {
    base.baseUrl = String(item.baseUrl || "").trim();
  }
  if (hasOwn(item, "temperature")) {
    base.temperature = Math.min(2, Math.max(0, asNumber(item.temperature, 0.2)));
  }
  if (hasOwn(item, "maxTokens")) {
    base.maxTokens = Math.max(1, asNumber(item.maxTokens, 1024));
  }
  if (hasOwn(item, "isActive")) {
    base.isActive = Boolean(item.isActive);
  }
  return base;
};

const proxyCursorByType = new Map();

const ensureSystemConfig = async () => {
  const found = await prisma.systemConfig.findUnique({ where: { id: "default" } });
  if (found) {
    return found;
  }

  return prisma.systemConfig.create({
    data: {
      id: "default",
      siteName: "SkyHotel Agent Pro",
      supportContact: "400-888-9999",
      maintenanceMode: false,
      maintenanceMessage: "系统升级中，预计1小时后恢复。",
      enableNewUser: true,
      enablePlatinum: true,
      enableCorporate: true,
      disabledCorporateNames: ["某某科技 (风控中)", "旧协议单位"]
    }
  });
};

export const prismaStore = {
  async createSession(user) {
    const token = randomUUID();
    await prisma.session.create({
      data: {
        token,
        userId: user.id,
        role: user.role,
        createdAt: new Date()
      }
    });
    return token;
  },
  async getSession(token) {
    if (!token) {
      return null;
    }
    const session = await prisma.session.findUnique({ where: { token } });
    if (!session) {
      return null;
    }
    return {
      ...session,
      createdAt: session.createdAt.toISOString()
    };
  },
  async deleteSession(token) {
    if (!token) {
      return;
    }
    await prisma.session.deleteMany({ where: { token } });
  },
  async listUsers() {
    const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
    return users.map(({ password, ...rest }) => ({
      ...rest,
      createdAt: rest.createdAt.toISOString(),
      approvedAt: rest.approvedAt ? rest.approvedAt.toISOString() : null
    }));
  },
  async getUserById(id) {
    if (!id) {
      return null;
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return null;
    }
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null
    };
  },
  async getUserByUsername(username) {
    if (!username) {
      return null;
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return null;
    }
    return {
      ...user,
      createdAt: user.createdAt.toISOString(),
      approvedAt: user.approvedAt ? user.approvedAt.toISOString() : null
    };
  },
  verifyUserPassword(user, plainPassword) {
    return verifyPassword(plainPassword, user?.password);
  },
  async createRegistration(payload) {
    const item = await prisma.user.create({
      data: {
        username: payload.username,
        name: payload.name,
        password: hashPassword(payload.password),
        role: "USER",
        status: "PENDING",
        permissions: createDefaultPermissions()
      }
    });
    const { password, ...safe } = item;
    return {
      ...safe,
      createdAt: safe.createdAt.toISOString(),
      approvedAt: safe.approvedAt ? safe.approvedAt.toISOString() : null
    };
  },
  async createUser(payload) {
    const item = await prisma.user.create({
      data: {
        username: payload.username,
        name: payload.name,
        password: hashPassword(payload.password || "123456"),
        role: payload.role || "USER",
        status: payload.status || "ACTIVE",
        permissions: normalizePermissions(payload.permissions, createDefaultPermissions()),
        approvedAt: payload.status === "ACTIVE" ? new Date() : null
      }
    });
    const { password, ...safe } = item;
    return {
      ...safe,
      createdAt: safe.createdAt.toISOString(),
      approvedAt: safe.approvedAt ? safe.approvedAt.toISOString() : null
    };
  },
  async updateUser(id, patch) {
    const existed = await prisma.user.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const next = {
      ...patch,
      permissions: patch.permissions
        ? normalizePermissions(patch.permissions, existed.permissions || createDefaultPermissions())
        : undefined
    };
    if (patch.password) {
      next.password = hashPassword(patch.password);
    }
    if (patch.status === "ACTIVE" && !existed.approvedAt) {
      next.approvedAt = new Date();
    }
    const updated = await prisma.user.update({
      where: { id },
      data: next
    });
    const { password, ...safe } = updated;
    return {
      ...safe,
      createdAt: safe.createdAt.toISOString(),
      approvedAt: safe.approvedAt ? safe.approvedAt.toISOString() : null
    };
  },
  async listPoolAccounts(filters = {}) {
    const where = {};
    if (filters.is_online !== undefined) {
      where.isOnline = String(filters.is_online) === "true" || filters.is_online === true;
    }
    if (filters.search) {
      const search = String(filters.search);
      where.OR = [
        { phone: { contains: search } },
        { remark: { contains: search } }
      ];
    }
    const rows = await prisma.poolAccount.findMany({ where, orderBy: { updatedAt: "desc" } });
    let items = rows.map(projectPoolAccount);
    if (filters.search) {
      const keyword = String(filters.search).toLowerCase();
      items = items.filter((it) =>
        it.phone.toLowerCase().includes(keyword) ||
        String(it.remark || "").toLowerCase().includes(keyword) ||
        (it.corporate_agreements || []).some((corp) => String(corp.name || "").toLowerCase().includes(keyword))
      );
    }
    if (filters.tier) {
      items = items.filter((it) => it.tier === filters.tier);
    }
    return items;
  },
  async getPoolAccount(id) {
    const item = await prisma.poolAccount.findUnique({ where: { id } });
    return item ? projectPoolAccount(item) : null;
  },
  async isPoolTokenTaken(token, excludeId = null) {
    const rows = await prisma.poolAccount.findMany({
      where: {
        loginTokenCipher: { not: null },
        ...(excludeId ? { id: { not: excludeId } } : {})
      },
      select: { id: true, loginTokenCipher: true }
    });
    for (const row of rows) {
      try {
        if (decryptPoolToken(row.loginTokenCipher || "") === token) {
          return true;
        }
      } catch {
        continue;
      }
    }
    return false;
  },
  async createPoolAccount(payload) {
    const token = String(payload.token || "").trim();
    const row = await prisma.poolAccount.create({
      data: {
        phone: String(payload.phone || "").trim(),
        loginTokenCipher: token ? encryptPoolToken(token) : null,
        remark: payload.remark ? String(payload.remark) : null,
        isOnline: Boolean(payload.is_online),
        isPlatinum: Boolean(payload.is_platinum),
        isNewUser: Boolean(payload.is_new_user),
        corporateAgreements: normalizeCorporateBindings(payload.corporate_agreements, []),
        points: Math.max(0, Number(payload.points) || 0),
        breakfastCoupons: Math.max(0, Number(payload.breakfast_coupons) || 0),
        roomUpgradeCoupons: Math.max(0, Number(payload.room_upgrade_coupons) || 0),
        lateCheckoutCoupons: Math.max(0, Number(payload.late_checkout_coupons) || 0),
        slippersCoupons: Math.max(0, Number(payload.slippersCoupons) || 0),
        dailyOrdersLeft: Math.max(0, Number(payload.dailyOrdersLeft) || 0),
        lastExecution: {},
        lastResult: {}
      }
    });
    return projectPoolAccount(row);
  },
  async updatePoolAccount(id, patch) {
    const existed = await prisma.poolAccount.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const data = {};
    if (hasOwn(patch, "phone")) {
      data.phone = String(patch.phone || "").trim();
    }
    if (hasOwn(patch, "token")) {
      const token = String(patch.token || "").trim();
      data.loginTokenCipher = token ? encryptPoolToken(token) : existed.loginTokenCipher;
    }
    if (hasOwn(patch, "remark")) {
      data.remark = patch.remark ? String(patch.remark) : null;
    }
    if (hasOwn(patch, "is_online")) {
      data.isOnline = Boolean(patch.is_online);
    }
    if (hasOwn(patch, "is_platinum")) {
      data.isPlatinum = Boolean(patch.is_platinum);
    }
    if (hasOwn(patch, "is_new_user")) {
      data.isNewUser = Boolean(patch.is_new_user);
    }
    if (hasOwn(patch, "corporate_agreements")) {
      data.corporateAgreements = normalizeCorporateBindings(patch.corporate_agreements, existed.corporateAgreements || []);
    }
    if (hasOwn(patch, "is_corp_user") && !patch.is_corp_user && !hasOwn(patch, "corporate_agreements")) {
      data.corporateAgreements = [];
    }
    if (hasOwn(patch, "breakfast_coupons")) {
      data.breakfastCoupons = Math.max(0, Number(patch.breakfast_coupons) || 0);
    }
    if (hasOwn(patch, "room_upgrade_coupons")) {
      data.roomUpgradeCoupons = Math.max(0, Number(patch.room_upgrade_coupons) || 0);
    }
    if (hasOwn(patch, "late_checkout_coupons")) {
      data.lateCheckoutCoupons = Math.max(0, Number(patch.late_checkout_coupons) || 0);
    }
    if (hasOwn(patch, "points")) {
      data.points = Math.max(0, Number(patch.points) || 0);
    }
    if (hasOwn(patch, "dailyOrdersLeft")) {
      data.dailyOrdersLeft = Math.max(0, Number(patch.dailyOrdersLeft) || 0);
    }
    const updated = await prisma.poolAccount.update({ where: { id }, data });
    return projectPoolAccount(updated);
  },
  async deletePoolAccount(id) {
    try {
      await prisma.poolAccount.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
  async acquirePoolToken(options = {}) {
    const tier = options.tier ? String(options.tier).toUpperCase() : null;
    const rows = await prisma.poolAccount.findMany({ where: { isOnline: true } });
    const candidates = rows.filter((it) => canUseTier(it, tier));
    if (candidates.length === 0) {
      return null;
    }
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    for (const item of shuffled) {
      const cipher = item.loginTokenCipher;
      if (!cipher) {
        continue;
      }
      try {
        const token = decryptPoolToken(cipher);
        if (token) {
          return {
            token,
            accountId: item.id,
            accountPhone: item.phone
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  },
  async listBlacklistRecords(filters = {}) {
    const where = {};
    if (filters.chainId) {
      where.chainId = String(filters.chainId);
    }
    if (filters.severity) {
      where.severity = String(filters.severity);
    }
    if (filters.status) {
      where.status = String(filters.status);
    }
    const rows = await prisma.blacklistRecord.findMany({ where, orderBy: { date: "desc" } });
    let items = rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
    if (filters.search) {
      const keyword = String(filters.search).toLowerCase();
      items = items.filter(
        (it) =>
          it.hotelName.toLowerCase().includes(keyword) ||
          it.chainId.toLowerCase().includes(keyword) ||
          it.reason.toLowerCase().includes(keyword) ||
          (Array.isArray(it.tags) ? it.tags : []).some((tag) => String(tag).toLowerCase().includes(keyword))
      );
    }
    return items;
  },
  async getBlacklistRecord(id) {
    const row = await prisma.blacklistRecord.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async createBlacklistRecord(payload, reporter) {
    const item = await prisma.blacklistRecord.create({
      data: {
        chainId: String(payload.chainId || "UNKNOWN").trim(),
        hotelName: String(payload.hotelName).trim(),
        severity: payload.severity,
        reason: String(payload.reason).trim(),
        tags: Array.isArray(payload.tags)
          ? Array.from(new Set(payload.tags.map((it) => String(it).trim()).filter(Boolean)))
          : [],
        status: payload.status || "ACTIVE",
        reportedBy: payload.reportedBy || reporter.name,
        reporterId: reporter.id,
        source: payload.source || "manual",
        date: payload.date || now().slice(0, 10)
      }
    });
    return {
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    };
  },
  async updateBlacklistRecord(id, patch) {
    const existed = await prisma.blacklistRecord.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const next = {
      ...patch
    };
    if (patch.tags) {
      next.tags = Array.from(new Set(patch.tags.map((it) => String(it).trim()).filter(Boolean)));
    }
    const updated = await prisma.blacklistRecord.update({ where: { id }, data: next });
    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  },
  async deleteBlacklistRecord(id) {
    try {
      await prisma.blacklistRecord.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
  async listBlacklistHotels(filters = {}) {
    const records = await this.listBlacklistRecords(filters);
    const map = new Map();
    const severityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    records.forEach((record) => {
      const key = `${record.chainId}::${record.hotelName}`;
      const current = map.get(key) || {
        chainId: record.chainId,
        hotelName: record.hotelName,
        count: 0,
        maxSeverity: "LOW",
        lastDate: "",
        tags: new Set(),
        records: []
      };

      current.count += 1;
      current.records.push(record);
      (Array.isArray(record.tags) ? record.tags : []).forEach((tag) => current.tags.add(tag));

      if (severityWeight[record.severity] > severityWeight[current.maxSeverity]) {
        current.maxSeverity = record.severity;
      }

      if (record.date > current.lastDate) {
        current.lastDate = record.date;
      }

      map.set(key, current);
    });

    return Array.from(map.values())
      .map((it) => ({ ...it, tags: Array.from(it.tags) }))
      .sort((a, b) => {
        if (severityWeight[a.maxSeverity] !== severityWeight[b.maxSeverity]) {
          return severityWeight[b.maxSeverity] - severityWeight[a.maxSeverity];
        }
        return b.count - a.count;
      });
  },
  async checkBlacklistedHotel(chainId, hotelName) {
    const chain = String(chainId || "").toLowerCase();
    const name = String(hotelName || "").toLowerCase();
    const activeRecords = await prisma.blacklistRecord.findMany({ where: { status: "ACTIVE" } });
    const matched = activeRecords.filter(
      (it) =>
        ((chain && it.chainId.toLowerCase() === chain) || (name && it.hotelName.toLowerCase() === name))
    );

    const severityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const maxSeverity = matched.reduce(
      (acc, cur) => (severityWeight[cur.severity] > severityWeight[acc] ? cur.severity : acc),
      "LOW"
    );

    return {
      blacklisted: matched.length > 0,
      count: matched.length,
      maxSeverity,
      records: matched.map((it) => ({
        ...it,
        createdAt: it.createdAt.toISOString(),
        updatedAt: it.updatedAt.toISOString()
      }))
    };
  },
  async getSystemConfig() {
    await ensureSystemConfig();
    const config = await prisma.systemConfig.findUnique({
      where: { id: "default" },
      include: {
        proxies: true,
        llmModels: true
      }
    });

    return {
      siteName: config.siteName,
      supportContact: config.supportContact,
      maintenanceMode: config.maintenanceMode,
      maintenanceMessage: config.maintenanceMessage,
      channels: {
        enableNewUser: config.enableNewUser,
        enablePlatinum: config.enablePlatinum,
        enableCorporate: config.enableCorporate,
        disabledCorporateNames: config.disabledCorporateNames
      },
      proxies: config.proxies.map((it) => ({ ...it, lastChecked: it.lastChecked.toISOString() })),
      llmModels: config.llmModels
    };
  },
  async updateSystemConfig(patch = {}) {
    await ensureSystemConfig();

    const updateData = {};
    if (hasOwn(patch, "siteName")) {
      updateData.siteName = String(patch.siteName || "").trim();
    }
    if (hasOwn(patch, "supportContact")) {
      updateData.supportContact = String(patch.supportContact || "").trim();
    }
    if (hasOwn(patch, "maintenanceMode")) {
      updateData.maintenanceMode = Boolean(patch.maintenanceMode);
    }
    if (hasOwn(patch, "maintenanceMessage")) {
      updateData.maintenanceMessage = String(patch.maintenanceMessage || "").trim();
    }

    if (patch.channels && typeof patch.channels === "object") {
      if (hasOwn(patch.channels, "enableNewUser")) {
        updateData.enableNewUser = Boolean(patch.channels.enableNewUser);
      }
      if (hasOwn(patch.channels, "enablePlatinum")) {
        updateData.enablePlatinum = Boolean(patch.channels.enablePlatinum);
      }
      if (hasOwn(patch.channels, "enableCorporate")) {
        updateData.enableCorporate = Boolean(patch.channels.enableCorporate);
      }
      if (hasOwn(patch.channels, "disabledCorporateNames")) {
        updateData.disabledCorporateNames = Array.isArray(patch.channels.disabledCorporateNames)
          ? Array.from(new Set(patch.channels.disabledCorporateNames.map((it) => String(it).trim()).filter(Boolean)))
          : [];
      }
    }

    await prisma.systemConfig.update({
      where: { id: "default" },
      data: updateData
    });

    if (Array.isArray(patch.llmModels)) {
      const models = patch.llmModels.map((it) => normalizeLlmModel(it));
      await prisma.$transaction([
        prisma.llmModel.deleteMany({ where: { configId: "default" } }),
        ...models.map((it) => prisma.llmModel.create({ data: { ...it, configId: "default" } }))
      ]);
    }

    return this.getSystemConfig();
  },
  async listProxyNodes() {
    await ensureSystemConfig();
    const rows = await prisma.proxyNode.findMany({ where: { configId: "default" } });
    return rows.map((it) => ({ ...it, lastChecked: it.lastChecked.toISOString() }));
  },
  async getProxyNode(id) {
    const row = await prisma.proxyNode.findUnique({ where: { id } });
    return row ? { ...row, lastChecked: row.lastChecked.toISOString() } : null;
  },
  async createProxyNode(payload = {}) {
    await ensureSystemConfig();
    const node = normalizeProxyPayload(payload, null);
    const row = await prisma.proxyNode.create({ data: { ...node, configId: "default", lastChecked: new Date() } });
    return { ...row, lastChecked: row.lastChecked.toISOString() };
  },
  async updateProxyNode(id, patch = {}) {
    const existed = await prisma.proxyNode.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const next = normalizeProxyPayload(patch, {
      ...existed,
      lastChecked: existed.lastChecked.toISOString()
    });
    const row = await prisma.proxyNode.update({
      where: { id },
      data: {
        ip: next.ip,
        port: next.port,
        type: next.type,
        status: next.status,
        location: next.location,
        failCount: next.failCount,
        lastChecked: new Date(next.lastChecked)
      }
    });
    return { ...row, lastChecked: row.lastChecked.toISOString() };
  },
  async deleteProxyNode(id) {
    try {
      await prisma.proxyNode.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  },
  async acquireProxyNode(options = {}) {
    const rows = await prisma.proxyNode.findMany({ where: { status: "ONLINE" } });
    if (rows.length === 0) {
      return null;
    }
    const preferredType = options.type ? String(options.type).toUpperCase() : null;
    const candidates = preferredType
      ? rows.filter((it) => it.type === preferredType)
      : rows;
    const list = candidates.length > 0 ? candidates : rows;
    const cursorKey = preferredType || "ALL";
    const cursor = proxyCursorByType.get(cursorKey) || 0;
    const picked = list[cursor % list.length];
    proxyCursorByType.set(cursorKey, cursor + 1);
    return {
      ...picked,
      lastChecked: picked.lastChecked.toISOString()
    };
  },
  async markProxyHealth(id, status, extra = {}) {
    const existed = await prisma.proxyNode.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const nextStatus = String(status || "").toUpperCase();
    const validStatus = ["ONLINE", "OFFLINE", "LATENCY"].includes(nextStatus)
      ? nextStatus
      : existed.status;
    const failCount = validStatus === "OFFLINE"
      ? existed.failCount + 1
      : validStatus === "ONLINE"
        ? 0
        : existed.failCount;

    const row = await prisma.proxyNode.update({
      where: { id },
      data: {
        status: validStatus,
        failCount,
        location: hasOwn(extra, "location") ? String(extra.location || "").trim() : existed.location,
        lastChecked: new Date()
      }
    });
    return { ...row, lastChecked: row.lastChecked.toISOString() };
  },
  async listLlmModels() {
    await ensureSystemConfig();
    return prisma.llmModel.findMany({ where: { configId: "default" } });
  },
  async getLlmModelById(modelId) {
    if (!modelId) {
      return null;
    }
    return prisma.llmModel.findUnique({ where: { id: modelId } });
  },
  async getActiveLlmModel() {
    return prisma.llmModel.findFirst({ where: { configId: "default", isActive: true } });
  }
};
