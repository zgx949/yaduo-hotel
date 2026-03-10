import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { decryptPoolToken, encryptPoolToken } from "../services/token-crypto.service.js";
import { env } from "../config/env.js";
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

const decryptPoolTokenSafe = (cipher) => {
  try {
    return decryptPoolToken(cipher || "");
  } catch {
    return null;
  }
};

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

const hasCorporateAgreement = (account, corporateName = null) => {
  const agreements = Array.isArray(account.corporateAgreements) ? account.corporateAgreements : [];
  const enabled = agreements.filter((it) => it?.enabled !== false).map((it) => String(it?.name || "").trim()).filter(Boolean);
  if (enabled.length === 0) {
    return false;
  }
  if (!corporateName) {
    return true;
  }
  return enabled.includes(String(corporateName).trim());
};

const canUseTier = (account, tier, corporateName = null) => {
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
    return hasCorporateAgreement(account, corporateName);
  }
  return true;
};

const taskStateToExecution = (taskState) => {
  const normalized = String(taskState || "").toLowerCase();
  if (normalized === "waiting") {
    return "QUEUED";
  }
  if (normalized === "active") {
    return "SUBMITTING";
  }
  if (normalized === "completed") {
    return "ORDERED";
  }
  if (normalized === "failed") {
    return "FAILED";
  }
  return "QUEUED";
};

const buildOrderDetailUrl = (item) => {
  if (!item.atourOrderId) {
    return null;
  }
  const base = String(process.env.ATOUR_ORDER_DETAIL_URL || env.atourPlaceSearchBaseUrl || "").trim();
  if (!base) {
    return null;
  }
  try {
    const url = new URL(base.startsWith("http") ? base : `https://${base}`);
    url.searchParams.set("orderId", String(item.atourOrderId));
    return url.toString();
  } catch {
    return null;
  }
};

const buildPaymentLink = (item) => {
  if (item.executionStatus !== "ORDERED" && item.executionStatus !== "DONE") {
    return null;
  }
  if (item.paymentStatus === "PAID") {
    return null;
  }
  const orderId = item.atourOrderId || item.id;
  return `atour://payment/checkout?orderId=${encodeURIComponent(orderId)}`;
};

const projectOrderItem = (item) => ({
  id: item.id,
  groupId: item.groupId,
  atourOrderId: item.atourOrderId,
  bookingTier: item.bookingTier || null,
  roomTypeId: item.roomTypeId || null,
  rateCode: item.rateCode || null,
  rateCodeId: item.rateCodeId || null,
  rpActivityId: item.rpActivityId || null,
  rateCodePriceType: item.rateCodePriceType || null,
  rateCodeActivities: item.rateCodeActivities || null,
  remark: item.remark || null,
  breakfastCount: Number(item.breakfastCount) || 0,
  roomLevelUpCount: Number(item.roomLevelUpCount) || 0,
  delayedCheckOutCount: Number(item.delayedCheckOutCount) || 0,
  shooseCount: Number(item.shooseCount) || 0,
  roomType: item.roomType,
  roomCount: item.roomCount,
  accountId: item.accountId,
  accountPhone: item.accountPhone,
  checkInDate: item.checkInDate.toISOString().slice(0, 10),
  checkOutDate: item.checkOutDate.toISOString().slice(0, 10),
  amount: item.amount,
  status: item.status,
  paymentStatus: item.paymentStatus,
  executionStatus: item.executionStatus,
  splitIndex: item.splitIndex,
  splitTotal: item.splitTotal,
  paymentLink: buildPaymentLink(item),
  detailUrl: buildOrderDetailUrl(item),
  createdAt: item.createdAt.toISOString(),
  updatedAt: item.updatedAt.toISOString()
});

const aggregateOrderStatuses = (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { status: "PROCESSING", paymentStatus: "UNPAID" };
  }

  const hasFailed = items.some((it) => it.status === "FAILED");
  const hasPlanPending = items.some((it) => it.executionStatus === "PLAN_PENDING");
  const hasProcessing = items.some((it) => ["PROCESSING", "WAITING", "PENDING"].includes(String(it.status || "").toUpperCase()));
  const allConfirmed = items.every((it) => it.status === "CONFIRMED");
  const allCancelled = items.every((it) => it.status === "CANCELLED");

  let status = hasPlanPending ? "WAIT_CONFIRM" : "PROCESSING";
  if (hasFailed) {
    status = "FAILED";
  } else if (allCancelled) {
    status = "CANCELLED";
  } else if (allConfirmed) {
    status = "CONFIRMED";
  } else if (hasProcessing) {
    status = "PROCESSING";
  }

  const paidCount = items.filter((it) => it.paymentStatus === "PAID").length;
  const refundedCount = items.filter((it) => it.paymentStatus === "REFUNDED").length;
  let paymentStatus = "UNPAID";
  if (refundedCount === items.length && items.length > 0) {
    paymentStatus = "REFUNDED";
  } else if (paidCount === items.length) {
    paymentStatus = "PAID";
  } else if (paidCount > 0 || refundedCount > 0) {
    paymentStatus = "PARTIAL";
  }

  return { status, paymentStatus };
};

const ORDER_STATUS_SYNC_TERMINAL = new Set(["CANCELLED", "COMPLETED", "REFUNDED", "REFUNDING"]);

const projectOrderStatusScanCandidate = (item) => ({
  id: item.id,
  groupId: item.groupId,
  atourOrderId: item.atourOrderId,
  bookingTier: item.bookingTier || null,
  accountId: item.accountId || null,
  status: item.status,
  paymentStatus: item.paymentStatus,
  executionStatus: item.executionStatus,
  updatedAt: item.updatedAt.toISOString(),
  chainId: item.group?.chainId ? String(item.group.chainId) : ""
});

const calcRoomNights = (item) => {
  const start = new Date(item.checkInDate).getTime();
  const end = new Date(item.checkOutDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return 1;
  }
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
};

const clampPage = (value) => Math.max(1, Number(value) || 1);
const clampPageSize = (value, max = 200, fallback = 20) => Math.max(1, Math.min(max, Number(value) || fallback));

const projectPoolAccount = (entity) => {
  const tier = deriveTier(entity);
  const status = !entity.isEnabled ? "BLOCKED" : entity.isOnline ? "ACTIVE" : "OFFLINE";
  const corporateNames = entity.corporateAgreements.map((it) => it.name);

  return {
    id: entity.id,
    phone: entity.phone,
    token: "",
    token_configured: Boolean(entity.loginTokenCipher),
    is_enabled: entity.isEnabled,
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
    discount_coupon_assets: Array.isArray(entity.discountCouponAssets) ? entity.discountCouponAssets : [],
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
};

const normalizeProxyPayload = (payload = {}, existing = null) => {
  const base = existing
    ? clone(existing)
    : {
      id: `proxy-${randomUUID().slice(0, 8)}`,
      host: "",
      port: 0,
      type: "DYNAMIC",
      status: "OFFLINE",
      authEnabled: false,
      authUsername: "",
      authPassword: "",
      lastChecked: now(),
      location: "",
      failCount: 0
    };

  if (hasOwn(payload, "host")) {
    base.host = String(payload.host || "").trim();
  } else if (hasOwn(payload, "ip")) {
    base.host = String(payload.ip || "").trim();
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
  if (hasOwn(payload, "authEnabled")) {
    base.authEnabled = Boolean(payload.authEnabled);
    if (!base.authEnabled) {
      base.authUsername = "";
      base.authPassword = "";
    }
  }
  if (hasOwn(payload, "authUsername")) {
    base.authUsername = String(payload.authUsername || "").trim();
  }
  if (hasOwn(payload, "authPassword")) {
    base.authPassword = String(payload.authPassword || "").trim();
  }

  if (!base.authEnabled) {
    base.authUsername = "";
    base.authPassword = "";
  }
  base.lastChecked = now();
  return base;
};

const projectProxyNode = (row, { withSecret = false } = {}) => {
  if (!row) {
    return null;
  }
  const data = {
    ...row,
    ip: row.host,
    lastChecked: row.lastChecked instanceof Date ? row.lastChecked.toISOString() : row.lastChecked,
    authConfigured: Boolean(row.authEnabled && row.authUsername)
  };

  if (!withSecret) {
    delete data.authPassword;
  }

  return data;
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
    if (filters.is_enabled !== undefined) {
      where.isEnabled = String(filters.is_enabled) === "true" || filters.is_enabled === true;
    }
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
  async listPoolAccountsPage(filters = {}) {
    const page = clampPage(filters.page);
    const pageSize = clampPageSize(filters.pageSize, 200, 20);

    const where = {};
    if (filters.is_enabled !== undefined) {
      where.isEnabled = String(filters.is_enabled) === "true" || filters.is_enabled === true;
    }
    if (filters.is_online !== undefined) {
      where.isOnline = String(filters.is_online) === "true" || filters.is_online === true;
    }

    let allItems = [];
    if (filters.search) {
      const rows = await prisma.poolAccount.findMany({ where, orderBy: { updatedAt: "desc" } });
      const keyword = String(filters.search).toLowerCase();
      allItems = rows
        .map(projectPoolAccount)
        .filter((it) =>
          it.phone.toLowerCase().includes(keyword) ||
          String(it.remark || "").toLowerCase().includes(keyword) ||
          String(it.id || "").toLowerCase().includes(keyword) ||
          (it.corporate_agreements || []).some((corp) => String(corp.name || "").toLowerCase().includes(keyword))
        );
    } else {
      const rows = await prisma.poolAccount.findMany({ where, orderBy: { updatedAt: "desc" } });
      allItems = rows.map(projectPoolAccount);
    }

    if (filters.tier) {
      allItems = allItems.filter((it) => it.tier === filters.tier);
    }

    const total = allItems.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const normalizedPage = Math.min(page, totalPages);
    const offset = (normalizedPage - 1) * pageSize;
    const items = allItems.slice(offset, offset + pageSize);
    return {
      items,
      meta: {
        total,
        page: normalizedPage,
        pageSize,
        hasMore: offset + items.length < total,
        totalPages
      }
    };
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
        isEnabled: hasOwn(payload, "is_enabled") ? Boolean(payload.is_enabled) : true,
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
        lastResult: {},
        discountCouponAssets: Array.isArray(payload.discount_coupon_assets) ? payload.discount_coupon_assets : []
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
    if (hasOwn(patch, "is_enabled")) {
      data.isEnabled = Boolean(patch.is_enabled);
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
    if (hasOwn(patch, "slippers_coupons") || hasOwn(patch, "slippersCoupons")) {
      data.slippersCoupons = Math.max(0, Number(patch.slippers_coupons ?? patch.slippersCoupons) || 0);
    }
    if (hasOwn(patch, "points")) {
      data.points = Math.max(0, Number(patch.points) || 0);
    }
    if (hasOwn(patch, "dailyOrdersLeft")) {
      data.dailyOrdersLeft = Math.max(0, Number(patch.dailyOrdersLeft) || 0);
    }
    if (hasOwn(patch, "lastExecution")) {
      const current = (existed.lastExecution && typeof existed.lastExecution === "object" && !Array.isArray(existed.lastExecution))
        ? existed.lastExecution
        : {};
      const incoming = (patch.lastExecution && typeof patch.lastExecution === "object" && !Array.isArray(patch.lastExecution))
        ? patch.lastExecution
        : {};
      data.lastExecution = { ...current, ...incoming };
    }
    if (hasOwn(patch, "lastResult")) {
      const current = (existed.lastResult && typeof existed.lastResult === "object" && !Array.isArray(existed.lastResult))
        ? existed.lastResult
        : {};
      const incoming = (patch.lastResult && typeof patch.lastResult === "object" && !Array.isArray(patch.lastResult))
        ? patch.lastResult
        : {};
      data.lastResult = { ...current, ...incoming };
    }
    if (hasOwn(patch, "discount_coupon_assets")) {
      data.discountCouponAssets = Array.isArray(patch.discount_coupon_assets) ? patch.discount_coupon_assets : [];
    }
    const updated = await prisma.poolAccount.update({ where: { id }, data });
    return projectPoolAccount(updated);
  },
  async listPoolAccountCredentials(filters = {}) {
    const where = {};
    if (filters.is_enabled !== undefined) {
      where.isEnabled = Boolean(filters.is_enabled);
    }
    if (filters.is_online !== undefined) {
      where.isOnline = Boolean(filters.is_online);
    }

    const rows = await prisma.poolAccount.findMany({ where, orderBy: { updatedAt: "desc" } });
    return rows.map((row) => ({
      account: projectPoolAccount(row),
      token: row.loginTokenCipher ? decryptPoolTokenSafe(row.loginTokenCipher) : null
    }));
  },
  async getPoolAccountCredential(id) {
    const row = await prisma.poolAccount.findUnique({ where: { id } });
    if (!row) {
      return null;
    }
    return {
      account: projectPoolAccount(row),
      token: row.loginTokenCipher ? decryptPoolTokenSafe(row.loginTokenCipher) : null
    };
  },
  async getLatestChainIdByAccount(accountId) {
    if (!accountId) {
      return null;
    }
    const item = await prisma.orderItem.findFirst({
      where: { accountId: String(accountId) },
      include: { group: true },
      orderBy: { updatedAt: "desc" }
    });
    return item?.group?.chainId ? String(item.group.chainId) : null;
  },
  async getLatestCouponScanContextByAccount(accountId) {
    if (!accountId) {
      return null;
    }
    const item = await prisma.orderItem.findFirst({
      where: {
        accountId: String(accountId),
        group: { chainId: { not: "" } },
        roomTypeId: { not: null },
        OR: [{ rpActivityId: { not: null } }, { rateCodeId: { not: null } }]
      },
      include: { group: true },
      orderBy: { updatedAt: "desc" }
    });
    if (!item || !item.group) {
      return null;
    }
    return {
      chainId: String(item.group.chainId || ""),
      rpActivityId: String(item.rpActivityId || item.rateCodeId || ""),
      startDate: item.checkInDate.toISOString().slice(0, 10),
      endDate: item.checkOutDate.toISOString().slice(0, 10),
      roomTypeId: String(item.roomTypeId || ""),
      defaultAmount: Number(item.amount) || 0
    };
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
    const corporateName = options.corporateName ? String(options.corporateName).trim() : null;
    const minDailyOrdersLeft = Math.max(0, Number(options.minDailyOrdersLeft || 0));
    const preferredAccountId = options.preferredAccountId ? String(options.preferredAccountId) : null;
    const rows = await prisma.poolAccount.findMany({ where: { isOnline: true, isEnabled: true } });
    const candidates = rows.filter((it) => canUseTier(it, tier, corporateName) && (Number(it.dailyOrdersLeft) || 0) >= minDailyOrdersLeft);

    if (preferredAccountId) {
      const preferred = candidates.find((it) => it.id === preferredAccountId);
      if (preferred?.loginTokenCipher) {
        const token = decryptPoolTokenSafe(preferred.loginTokenCipher);
        if (token) {
          return {
            token,
            accountId: preferred.id,
            accountPhone: preferred.phone,
            dailyOrdersLeft: Number(preferred.dailyOrdersLeft) || 0
          };
        }
      }
    }

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
            accountPhone: item.phone,
            dailyOrdersLeft: Number(item.dailyOrdersLeft) || 0
          };
        }
      } catch {
        continue;
      }
    }
    return null;
  },
  async reservePoolAccounts(accountIds = []) {
    const ids = Array.from(new Set((Array.isArray(accountIds) ? accountIds : []).map((it) => String(it)).filter(Boolean)));
    if (ids.length === 0) {
      return { ok: true, reserved: [] };
    }

    return prisma.$transaction(async (tx) => {
      const reserved = [];
      for (const id of ids) {
        const updated = await tx.poolAccount.updateMany({
          where: {
            id,
            isOnline: true,
            isEnabled: true,
            dailyOrdersLeft: { gte: 1 }
          },
          data: {
            dailyOrdersLeft: { decrement: 1 }
          }
        });
        if (updated.count !== 1) {
          throw new Error(`POOL_ACCOUNT_RESERVE_CONFLICT:${id}`);
        }
        reserved.push(id);
      }
      return { ok: true, reserved };
    });
  },
  async checkPoolAccountsAvailability(accountIds = []) {
    const ids = Array.from(new Set((Array.isArray(accountIds) ? accountIds : []).map((it) => String(it)).filter(Boolean)));
    if (ids.length === 0) {
      return { ok: true, total: 0 };
    }

    const rows = await prisma.poolAccount.findMany({
      where: {
        id: { in: ids },
        isOnline: true,
        isEnabled: true,
        dailyOrdersLeft: { gte: 1 }
      },
      select: { id: true }
    });
    return {
      ok: rows.length === ids.length,
      total: ids.length,
      available: rows.length
    };
  },
  async releasePoolAccountReservation(accountId, amount = 1) {
    if (!accountId) {
      return false;
    }
    const delta = Math.max(1, Number(amount) || 1);
    const updated = await prisma.poolAccount.updateMany({
      where: { id: String(accountId) },
      data: { dailyOrdersLeft: { increment: delta } }
    });
    return updated.count > 0;
  },
  async applyOrderItemSubmitSuccess(itemId, patch = {}) {
    if (!itemId) {
      throw new Error("order item id required");
    }
    return prisma.$transaction(async (tx) => {
      const existed = await tx.orderItem.findUnique({ where: { id: itemId } });
      if (!existed) {
        throw new Error("order item not found");
      }
      if (existed.status === "CANCELLED") {
        throw new Error("order item already cancelled");
      }

      const nextAccountId = patch.accountId ? String(patch.accountId) : (existed.accountId ? String(existed.accountId) : null);
      const claimed = await tx.orderItem.updateMany({
        where: {
          id: itemId,
          status: { not: "CANCELLED" },
          executionStatus: { notIn: ["ORDERED", "DONE"] }
        },
        data: {
          atourOrderId: hasOwn(patch, "atourOrderId") ? (patch.atourOrderId ? String(patch.atourOrderId) : null) : undefined,
          accountId: hasOwn(patch, "accountId") ? (patch.accountId ? String(patch.accountId) : null) : undefined,
          accountPhone: hasOwn(patch, "accountPhone") ? (patch.accountPhone ? String(patch.accountPhone) : null) : undefined,
          status: patch.status ? String(patch.status) : undefined,
          executionStatus: patch.executionStatus ? String(patch.executionStatus) : "ORDERED"
        }
      });

      if (claimed.count > 0 && nextAccountId) {
        const nights = calcRoomNights(existed);
        const charged = await tx.poolAccount.updateMany({
          where: {
            id: nextAccountId,
            dailyOrdersLeft: { gte: nights }
          },
          data: {
            dailyOrdersLeft: { decrement: nights }
          }
        });
        if (charged.count !== 1) {
          throw new Error(`账号可用间夜数不足：需要 ${nights} 间夜`);
        }
      }

      const latest = await tx.orderItem.findUnique({ where: { id: itemId } });
      return latest ? projectOrderItem(latest) : null;
    });
  },
  async createOrder(payload, creator) {
    const nowDate = new Date();
    const checkInDate = payload.checkInDate ? new Date(payload.checkInDate) : nowDate;
    const checkOutDate = payload.checkOutDate
      ? new Date(payload.checkOutDate)
      : new Date(nowDate.getTime() + 24 * 60 * 60 * 1000);
    const nights = Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (24 * 60 * 60 * 1000)));

    const submitNow = payload.submitNow !== false;

    const splitItems = Array.isArray(payload.splits) && payload.splits.length > 0
      ? payload.splits
      : [{
        bookingTier: payload.bookingTier || null,
        roomTypeId: payload.roomTypeId || null,
        rateCode: payload.rateCode || null,
        rateCodeId: payload.rateCodeId || payload.rpActivityId || null,
        rpActivityId: payload.rpActivityId || payload.rateCodeId || null,
        rateCodePriceType: payload.rateCodePriceType || null,
        rateCodeActivities: payload.rateCodeActivities || null,
        remark: payload.remark || null,
        breakfastCount: Math.max(0, Number(payload.breakfastCount) || 0),
        roomLevelUpCount: Math.max(0, Number(payload.roomLevelUpCount) || 0),
        delayedCheckOutCount: Math.max(0, Number(payload.delayedCheckOutCount) || 0),
        shooseCount: Math.max(0, Number(payload.shooseCount) || 0),
        roomType: payload.roomType || "标准房型",
        roomCount: Number(payload.roomCount) || 1,
        accountId: payload.accountId || null,
        accountPhone: payload.accountPhone || null,
        amount: Number(payload.price) || 0,
        atourOrderId: payload.atourOrderId || null,
        status: payload.status || (submitNow ? "PROCESSING" : "WAIT_CONFIRM"),
        paymentStatus: payload.paymentStatus || "UNPAID",
        executionStatus: submitNow ? "QUEUED" : "PLAN_PENDING"
      }];

    const totalAmount = splitItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);

    const group = await prisma.orderGroup.create({
      data: {
        bizOrderNo: payload.bizOrderNo || `BIZ-${Date.now()}`,
        chainId: String(payload.chainId || "UNKNOWN"),
        hotelName: String(payload.hotelName || ""),
        customerName: String(payload.customerName || ""),
        contactPhone: payload.contactPhone ? String(payload.contactPhone) : null,
        checkInDate,
        checkOutDate,
        totalNights: nights,
        totalAmount,
        currency: payload.currency || "CNY",
        status: payload.status || (submitNow ? "PROCESSING" : "WAIT_CONFIRM"),
        paymentStatus: payload.paymentStatus || "UNPAID",
        creatorId: creator.id,
        creatorName: creator.name,
        remark: payload.remark ? String(payload.remark) : null,
        items: {
          create: splitItems.map((it, idx) => ({
            checkInDate: it.checkInDate ? new Date(it.checkInDate) : checkInDate,
            checkOutDate: it.checkOutDate ? new Date(it.checkOutDate) : checkOutDate,
            atourOrderId: it.atourOrderId ? String(it.atourOrderId) : null,
            bookingTier: it.bookingTier ? String(it.bookingTier) : null,
            roomTypeId: it.roomTypeId ? String(it.roomTypeId) : null,
            rateCode: it.rateCode ? String(it.rateCode) : null,
            rateCodeId: it.rateCodeId ? String(it.rateCodeId) : (it.rpActivityId ? String(it.rpActivityId) : null),
            rpActivityId: it.rpActivityId ? String(it.rpActivityId) : (it.rateCodeId ? String(it.rateCodeId) : null),
            rateCodePriceType: it.rateCodePriceType ? String(it.rateCodePriceType) : null,
            rateCodeActivities: it.rateCodeActivities ? String(it.rateCodeActivities) : null,
            remark: it.remark ? String(it.remark) : null,
            breakfastCount: Math.max(0, Number(it.breakfastCount) || 0),
            roomLevelUpCount: Math.max(0, Number(it.roomLevelUpCount) || 0),
            delayedCheckOutCount: Math.max(0, Number(it.delayedCheckOutCount) || 0),
            shooseCount: Math.max(0, Number(it.shooseCount) || 0),
            roomType: String(it.roomType || payload.roomType || "标准房型"),
            roomCount: Math.max(1, Number(it.roomCount) || 1),
            accountId: it.accountId || null,
            accountPhone: it.accountPhone ? String(it.accountPhone) : null,
            amount: Number(it.amount) || 0,
            status: String(it.status || (submitNow ? "PROCESSING" : "WAIT_CONFIRM")),
            paymentStatus: String(it.paymentStatus || "UNPAID"),
            executionStatus: String(it.executionStatus || (submitNow ? "QUEUED" : "PLAN_PENDING")),
            splitIndex: idx + 1,
            splitTotal: splitItems.length
          }))
        }
      },
      include: {
        items: true
      }
    });

    return {
      id: group.id,
      bizOrderNo: group.bizOrderNo,
      chainId: group.chainId,
      hotelName: group.hotelName,
      customerName: group.customerName,
      contactPhone: group.contactPhone,
      checkInDate: group.checkInDate.toISOString().slice(0, 10),
      checkOutDate: group.checkOutDate.toISOString().slice(0, 10),
      totalNights: group.totalNights,
      totalAmount: group.totalAmount,
      currency: group.currency,
      status: group.status,
      paymentStatus: group.paymentStatus,
      creatorId: group.creatorId,
      creatorName: group.creatorName,
      remark: group.remark,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      items: group.items.map(projectOrderItem)
    };
  },
  async listOrders(filters = {}) {
    const where = {};
    if (filters.creatorId) {
      where.creatorId = filters.creatorId;
    }
    if (filters.status) {
      where.status = String(filters.status);
    }
    if (filters.search) {
      const keyword = String(filters.search);
      where.OR = [
        { bizOrderNo: { contains: keyword } },
        { hotelName: { contains: keyword } },
        { customerName: { contains: keyword } }
      ];
    }

    const groups = await prisma.orderGroup.findMany({
      where,
      include: {
        items: {
          orderBy: { splitIndex: "asc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return groups.map((group) => ({
      id: group.id,
      bizOrderNo: group.bizOrderNo,
      chainId: group.chainId,
      hotelName: group.hotelName,
      customerName: group.customerName,
      contactPhone: group.contactPhone,
      checkInDate: group.checkInDate.toISOString().slice(0, 10),
      checkOutDate: group.checkOutDate.toISOString().slice(0, 10),
      totalNights: group.totalNights,
      totalAmount: group.totalAmount,
      currency: group.currency,
      status: group.status,
      paymentStatus: group.paymentStatus,
      creatorId: group.creatorId,
      creatorName: group.creatorName,
      remark: group.remark,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      splitCount: group.items.length,
      items: group.items.map(projectOrderItem)
    }));
  },
  async listOrdersPage(filters = {}) {
    const where = {};
    if (filters.creatorId) {
      where.creatorId = filters.creatorId;
    }
    if (filters.status) {
      where.status = String(filters.status);
    }
    if (filters.search) {
      const keyword = String(filters.search);
      where.OR = [
        { bizOrderNo: { contains: keyword, mode: "insensitive" } },
        { hotelName: { contains: keyword, mode: "insensitive" } },
        { customerName: { contains: keyword, mode: "insensitive" } },
        { creatorName: { contains: keyword, mode: "insensitive" } },
        { chainId: { contains: keyword, mode: "insensitive" } },
        { contactPhone: { contains: keyword, mode: "insensitive" } }
      ];
    }

    const checkInFrom = filters.checkInFrom ? new Date(String(filters.checkInFrom)) : null;
    const checkInTo = filters.checkInTo ? new Date(String(filters.checkInTo)) : null;
    if ((checkInFrom && !Number.isNaN(checkInFrom.getTime())) || (checkInTo && !Number.isNaN(checkInTo.getTime()))) {
      where.checkInDate = {
        ...(checkInFrom && !Number.isNaN(checkInFrom.getTime()) ? { gte: checkInFrom } : {}),
        ...(checkInTo && !Number.isNaN(checkInTo.getTime()) ? { lte: checkInTo } : {})
      };
    }

    const page = clampPage(filters.page);
    const pageSize = clampPageSize(filters.pageSize, 200, 20);
    const skip = (page - 1) * pageSize;

    const [groups, total] = await Promise.all([
      prisma.orderGroup.findMany({
        where,
        include: {
          items: {
            orderBy: { splitIndex: "asc" }
          }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      }),
      prisma.orderGroup.count({ where })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
      items: groups.map((group) => ({
        id: group.id,
        bizOrderNo: group.bizOrderNo,
        chainId: group.chainId,
        hotelName: group.hotelName,
        customerName: group.customerName,
        contactPhone: group.contactPhone,
        checkInDate: group.checkInDate.toISOString().slice(0, 10),
        checkOutDate: group.checkOutDate.toISOString().slice(0, 10),
        totalNights: group.totalNights,
        totalAmount: group.totalAmount,
        currency: group.currency,
        status: group.status,
        paymentStatus: group.paymentStatus,
        creatorId: group.creatorId,
        creatorName: group.creatorName,
        remark: group.remark,
        createdAt: group.createdAt.toISOString(),
        updatedAt: group.updatedAt.toISOString(),
        splitCount: group.items.length,
        items: group.items.map(projectOrderItem)
      })),
      meta: {
        total,
        page,
        pageSize,
        hasMore: skip + groups.length < total,
        totalPages
      }
    };
  },
  async getOrder(orderGroupId) {
    const group = await prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      include: {
        items: {
          orderBy: { splitIndex: "asc" }
        }
      }
    });
    if (!group) {
      return null;
    }
    return {
      id: group.id,
      bizOrderNo: group.bizOrderNo,
      chainId: group.chainId,
      hotelName: group.hotelName,
      customerName: group.customerName,
      contactPhone: group.contactPhone,
      checkInDate: group.checkInDate.toISOString().slice(0, 10),
      checkOutDate: group.checkOutDate.toISOString().slice(0, 10),
      totalNights: group.totalNights,
      totalAmount: group.totalAmount,
      currency: group.currency,
      status: group.status,
      paymentStatus: group.paymentStatus,
      creatorId: group.creatorId,
      creatorName: group.creatorName,
      remark: group.remark,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      splitCount: group.items.length,
      items: group.items.map(projectOrderItem)
    };
  },
  async updateOrder(id, patch = {}) {
    const existed = await prisma.orderGroup.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    await prisma.orderGroup.update({
      where: { id },
      data: {
        status: patch.status ? String(patch.status) : undefined,
        paymentStatus: patch.paymentStatus ? String(patch.paymentStatus) : undefined,
        remark: hasOwn(patch, "remark") ? (patch.remark ? String(patch.remark) : null) : undefined,
        totalAmount: hasOwn(patch, "totalAmount") ? Number(patch.totalAmount) || 0 : undefined
      }
    });
    return this.getOrder(id);
  },
  async updateOrderItem(id, patch = {}) {
    const existed = await prisma.orderItem.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const nextRateCodeId = hasOwn(patch, "rateCodeId")
      ? (patch.rateCodeId ? String(patch.rateCodeId) : null)
      : hasOwn(patch, "rpActivityId")
        ? (patch.rpActivityId ? String(patch.rpActivityId) : null)
        : undefined;
    const nextRpActivityId = hasOwn(patch, "rpActivityId")
      ? (patch.rpActivityId ? String(patch.rpActivityId) : null)
      : hasOwn(patch, "rateCodeId")
        ? (patch.rateCodeId ? String(patch.rateCodeId) : null)
        : undefined;
    const item = await prisma.orderItem.update({
      where: { id },
      data: {
        atourOrderId: hasOwn(patch, "atourOrderId") ? (patch.atourOrderId ? String(patch.atourOrderId) : null) : undefined,
        bookingTier: hasOwn(patch, "bookingTier") ? (patch.bookingTier ? String(patch.bookingTier) : null) : undefined,
        roomTypeId: hasOwn(patch, "roomTypeId") ? (patch.roomTypeId ? String(patch.roomTypeId) : null) : undefined,
        rateCode: hasOwn(patch, "rateCode") ? (patch.rateCode ? String(patch.rateCode) : null) : undefined,
        rateCodeId: nextRateCodeId,
        rpActivityId: nextRpActivityId,
        rateCodePriceType: hasOwn(patch, "rateCodePriceType") ? (patch.rateCodePriceType ? String(patch.rateCodePriceType) : null) : undefined,
        rateCodeActivities: hasOwn(patch, "rateCodeActivities") ? (patch.rateCodeActivities ? String(patch.rateCodeActivities) : null) : undefined,
        remark: hasOwn(patch, "remark") ? (patch.remark ? String(patch.remark) : null) : undefined,
        breakfastCount: hasOwn(patch, "breakfastCount") ? Math.max(0, Number(patch.breakfastCount) || 0) : undefined,
        roomLevelUpCount: hasOwn(patch, "roomLevelUpCount") ? Math.max(0, Number(patch.roomLevelUpCount) || 0) : undefined,
        delayedCheckOutCount: hasOwn(patch, "delayedCheckOutCount") ? Math.max(0, Number(patch.delayedCheckOutCount) || 0) : undefined,
        shooseCount: hasOwn(patch, "shooseCount") ? Math.max(0, Number(patch.shooseCount) || 0) : undefined,
        accountId: hasOwn(patch, "accountId") ? patch.accountId || null : undefined,
        accountPhone: hasOwn(patch, "accountPhone") ? (patch.accountPhone ? String(patch.accountPhone) : null) : undefined,
        status: patch.status ? String(patch.status) : undefined,
        paymentStatus: patch.paymentStatus ? String(patch.paymentStatus) : undefined,
        executionStatus: patch.executionStatus ? String(patch.executionStatus) : undefined,
        amount: hasOwn(patch, "amount") ? Number(patch.amount) || 0 : undefined
      }
    });
    return {
      ...projectOrderItem(item)
    };
  },
  async submitOrderItem(itemId) {
    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return null;
    }
    if (["QUEUED", "SUBMITTING", "ORDERED", "DONE", "CANCELLED"].includes(item.executionStatus)) {
      return projectOrderItem(item);
    }
    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        executionStatus: "QUEUED",
        status: item.status === "CANCELLED" ? "CANCELLED" : "PROCESSING"
      }
    });
    return projectOrderItem(updated);
  },
  async cancelOrderItem(itemId) {
    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return null;
    }
    if (item.status === "CANCELLED") {
      return projectOrderItem(item);
    }

    const updated = await prisma.orderItem.update({
      where: { id: itemId },
      data: {
        status: "CANCELLED",
        executionStatus: "CANCELLED",
        paymentStatus: "UNPAID"
      }
    });

    const shouldRefundNights = Boolean(item.accountId) && (Boolean(item.atourOrderId) || ["ORDERED", "DONE"].includes(String(item.executionStatus || "")));
    if (shouldRefundNights) {
      const nights = calcRoomNights(item);
      await prisma.poolAccount.updateMany({
        where: { id: String(item.accountId) },
        data: { dailyOrdersLeft: { increment: nights } }
      });
    }

    await prisma.task.updateMany({
      where: { orderItemId: itemId, state: { in: ["waiting", "active"] } },
      data: { state: "cancelled", error: "cancelled by user" }
    });
    return projectOrderItem(updated);
  },
  async submitOrder(orderGroupId) {
    const group = await prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      include: { items: true }
    });
    if (!group) {
      return null;
    }
    const queued = [];
    for (const item of group.items) {
      if (item.status === "CANCELLED" || !["PLAN_PENDING", "FAILED"].includes(item.executionStatus)) {
        continue;
      }
      const next = await this.submitOrderItem(item.id);
      queued.push(next);
    }
    const refreshed = await this.refreshOrderStatus(orderGroupId);
    return { order: refreshed, items: queued };
  },
  async cancelOrder(orderGroupId) {
    const group = await prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      include: { items: true }
    });
    if (!group) {
      return null;
    }
    for (const item of group.items) {
      await this.cancelOrderItem(item.id);
    }
    const refreshed = await this.refreshOrderStatus(orderGroupId);
    return refreshed;
  },
  async getOrderItemById(id) {
    const item = await prisma.orderItem.findUnique({ where: { id } });
    return item ? projectOrderItem(item) : null;
  },
  async refreshOrderItemStatus(itemId) {
    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return null;
    }
    if (item.executionStatus === "PLAN_PENDING" || item.executionStatus === "CANCELLED") {
      return projectOrderItem(item);
    }
    const latestTask = await prisma.task.findFirst({
      where: { orderItemId: itemId },
      orderBy: { updatedAt: "desc" }
    });

    const patch = {};
    if (latestTask) {
      patch.executionStatus = taskStateToExecution(latestTask.state);
      if (latestTask.state === "completed" && item.status !== "CANCELLED") {
        patch.status = "CONFIRMED";
        if (!item.atourOrderId) {
          patch.atourOrderId = `AT-${Date.now()}-${itemId.slice(-4)}`;
        }
      }
      if (latestTask.state === "failed") {
        patch.status = "FAILED";
      }
    }

    const updated = Object.keys(patch).length > 0
      ? await prisma.orderItem.update({ where: { id: itemId }, data: patch })
      : item;

    await this.refreshOrderStatus(updated.groupId);
    return projectOrderItem(updated);
  },
  async refreshOrderStatus(orderGroupId) {
    if (!orderGroupId) {
      return null;
    }
    const group = await prisma.orderGroup.findUnique({
      where: { id: orderGroupId },
      include: { items: true }
    });
    if (!group) {
      return null;
    }
    const next = aggregateOrderStatuses(group.items);
    await prisma.orderGroup.update({
      where: { id: orderGroupId },
      data: {
        status: next.status,
        paymentStatus: next.paymentStatus,
        totalAmount: group.items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
      }
    });
    return this.getOrder(orderGroupId);
  },
  async listOrderItemsForPaymentStatusScan(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
    const rows = await prisma.orderItem.findMany({
      where: {
        atourOrderId: { not: null },
        paymentStatus: { not: "PAID" },
        status: { notIn: Array.from(ORDER_STATUS_SYNC_TERMINAL) }
      },
      include: {
        group: {
          select: {
            chainId: true
          }
        }
      },
      orderBy: [{ updatedAt: "asc" }],
      take: limit
    });
    return rows.map(projectOrderStatusScanCandidate);
  },
  async listOrderItemsForStayStatusScan(options = {}) {
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 500));
    const rows = await prisma.orderItem.findMany({
      where: {
        atourOrderId: { not: null },
        status: { in: ["CONFIRMED", "WAITING_CHECKIN", "CHECKED_IN", "PROCESSING"] }
      },
      include: {
        group: {
          select: {
            chainId: true
          }
        }
      },
      orderBy: [{ updatedAt: "asc" }],
      take: limit
    });
    return rows.map(projectOrderStatusScanCandidate);
  },
  async safeSyncOrderItemStatus(itemId, patch = {}, options = {}) {
    if (!itemId) {
      return { applied: false, reason: "INVALID_ITEM_ID", item: null };
    }

    const blockedCurrentStatuses = Array.isArray(options.blockedCurrentStatuses) && options.blockedCurrentStatuses.length > 0
      ? options.blockedCurrentStatuses.map((it) => String(it))
      : Array.from(ORDER_STATUS_SYNC_TERMINAL);

    const existed = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!existed) {
      return { applied: false, reason: "NOT_FOUND", item: null };
    }

    if (blockedCurrentStatuses.includes(String(existed.status || ""))) {
      return { applied: false, reason: "TERMINAL_BLOCKED", item: projectOrderItem(existed) };
    }

    const nextData = {};
    if (hasOwn(patch, "status") && patch.status) {
      const nextStatus = String(patch.status);
      const lockedByPaid = ["PAID", "REFUNDED"].includes(String(existed.paymentStatus || ""));
      if (!(lockedByPaid && ["PROCESSING", "WAIT_CONFIRM"].includes(nextStatus))) {
        nextData.status = nextStatus;
      }
    }
    if (hasOwn(patch, "executionStatus") && patch.executionStatus) {
      const nextExecution = String(patch.executionStatus);
      const lockedByPaid = ["PAID", "REFUNDED"].includes(String(existed.paymentStatus || ""));
      if (!(lockedByPaid && ["PLAN_PENDING", "QUEUED", "SUBMITTING", "ORDERED"].includes(nextExecution))) {
        nextData.executionStatus = nextExecution;
      }
    }
    if (hasOwn(patch, "paymentStatus") && patch.paymentStatus) {
      const nextPayment = String(patch.paymentStatus);
      if (
        !((existed.paymentStatus === "PAID" && nextPayment !== "PAID") ||
          (existed.paymentStatus === "REFUNDED" && nextPayment !== "REFUNDED"))
      ) {
        nextData.paymentStatus = nextPayment;
      }
    }
    if (hasOwn(patch, "amount")) {
      nextData.amount = Number(patch.amount) || 0;
    }

    if (Object.keys(nextData).length === 0) {
      return { applied: false, reason: "NO_CHANGES", item: projectOrderItem(existed) };
    }

    const where = {
      id: itemId,
      status: { notIn: blockedCurrentStatuses }
    };
    if (options.expectedUpdatedAt) {
      where.updatedAt = new Date(options.expectedUpdatedAt);
    }

    const result = await prisma.orderItem.updateMany({ where, data: nextData });
    const latest = await prisma.orderItem.findUnique({ where: { id: itemId } });
    return {
      applied: result.count > 0,
      reason: result.count > 0 ? "UPDATED" : "CONFLICT",
      item: latest ? projectOrderItem(latest) : null
    };
  },
  async getOrderItemLinks(itemId) {
    const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return null;
    }
    return {
      paymentLink: buildPaymentLink(item),
      detailUrl: buildOrderDetailUrl(item)
    };
  },
  async createTask(orderItemId) {
    const task = await prisma.task.create({
      data: {
        orderItemId,
        state: "waiting",
        progress: 0,
        error: null,
        result: null
      }
    });
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
  },
  async findTaskByOrderItem(orderItemId) {
    const task = await prisma.task.findFirst({
      where: { orderItemId },
      orderBy: { createdAt: "desc" }
    });
    if (!task) {
      return null;
    }
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
  },
  async getTask(id) {
    const task = await prisma.task.findUnique({ where: { id } });
    if (!task) {
      return null;
    }
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
  },
  async updateTask(id, patch = {}) {
    const existed = await prisma.task.findUnique({ where: { id } });
    if (!existed) {
      return null;
    }
    const task = await prisma.task.update({
      where: { id },
      data: {
        state: patch.state ? String(patch.state) : undefined,
        progress: hasOwn(patch, "progress") ? Number(patch.progress) || 0 : undefined,
        error: hasOwn(patch, "error") ? (patch.error ? String(patch.error) : null) : undefined,
        result: hasOwn(patch, "result") ? patch.result : undefined
      }
    });
    return {
      ...task,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString()
    };
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
      proxies: config.proxies.map((it) => projectProxyNode(it)),
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
    return rows.map((it) => projectProxyNode(it));
  },
  async getProxyNode(id, options = {}) {
    const row = await prisma.proxyNode.findUnique({ where: { id } });
    return projectProxyNode(row, { withSecret: Boolean(options.withSecret) });
  },
  async createProxyNode(payload = {}) {
    await ensureSystemConfig();
    const node = normalizeProxyPayload(payload, null);
    const row = await prisma.proxyNode.create({ data: { ...node, configId: "default", lastChecked: new Date() } });
    return projectProxyNode(row);
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
        host: next.host,
        port: next.port,
        type: next.type,
        status: next.status,
        authEnabled: next.authEnabled,
        authUsername: next.authUsername,
        authPassword: next.authPassword,
        location: next.location,
        failCount: next.failCount,
        lastChecked: new Date(next.lastChecked)
      }
    });
    return projectProxyNode(row);
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
      ip: picked.host,
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
    return projectProxyNode(row);
  },
  async listTaskModules() {
    const rows = await prisma.taskModuleConfig.findMany({ orderBy: [{ category: "asc" }, { moduleId: "asc" }] });
    return rows.map((it) => ({
      ...it,
      createdAt: it.createdAt.toISOString(),
      updatedAt: it.updatedAt.toISOString()
    }));
  },
  async ensureTaskModuleDefaults() {
    const defaults = [
      {
        moduleId: "order.submit",
        name: "订单下单执行",
        category: "REALTIME",
        queueName: "realtime-orders",
        enabled: true,
        schedule: null,
        concurrency: 4,
        attempts: 3,
        backoffMs: 2000,
        useProxy: true
      },
      {
        moduleId: "order.cancel",
        name: "订单取消执行",
        category: "REALTIME",
        queueName: "realtime-orders",
        enabled: true,
        schedule: null,
        concurrency: 2,
        attempts: 2,
        backoffMs: 2000,
        useProxy: true
      },
      {
        moduleId: "order.payment-link",
        name: "支付链接生成",
        category: "REALTIME",
        queueName: "realtime-payments",
        enabled: true,
        schedule: null,
        concurrency: 3,
        attempts: 2,
        backoffMs: 1500,
        useProxy: false
      },
      {
        moduleId: "order.payment-status-scan",
        name: "订单支付状态扫描",
        category: "SCHEDULED",
        queueName: "scheduled-orders",
        enabled: true,
        schedule: "*/30 * * * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "order.stay-status-scan",
        name: "待入住订单巡检",
        category: "SCHEDULED",
        queueName: "scheduled-orders",
        enabled: true,
        schedule: "10 2 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "account.token-refresh",
        name: "账号令牌巡检",
        category: "SCHEDULED",
        queueName: "scheduled-accounts",
        enabled: true,
        schedule: "10 6 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "account.daily-checkin",
        name: "每日签到",
        category: "SCHEDULED",
        queueName: "scheduled-accounts",
        enabled: true,
        schedule: "0 3 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "account.daily-lottery",
        name: "每日抽奖",
        category: "SCHEDULED",
        queueName: "scheduled-accounts",
        enabled: true,
        schedule: "10 3 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "account.points-scan",
        name: "积分扫描",
        category: "SCHEDULED",
        queueName: "scheduled-accounts",
        enabled: true,
        schedule: "20 */6 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      },
      {
        moduleId: "account.coupon-scan",
        name: "礼遇券扫描",
        category: "SCHEDULED",
        queueName: "scheduled-accounts",
        enabled: true,
        schedule: "25 */6 * * *",
        concurrency: 1,
        attempts: 1,
        backoffMs: 1000,
        useProxy: true
      }
    ];

    for (const module of defaults) {
      await prisma.taskModuleConfig.upsert({
        where: { moduleId: module.moduleId },
        update: {
          name: module.name,
          category: module.category,
          queueName: module.queueName,
          enabled: module.enabled,
          schedule: module.schedule,
          concurrency: module.concurrency,
          attempts: module.attempts,
          backoffMs: module.backoffMs,
          useProxy: module.useProxy
        },
        create: module
      });
    }
  },
  async getTaskModuleByModuleId(moduleId) {
    if (!moduleId) {
      return null;
    }
    const row = await prisma.taskModuleConfig.findUnique({ where: { moduleId } });
    if (!row) {
      return null;
    }
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async updateTaskModule(moduleId, patch = {}) {
    const existed = await prisma.taskModuleConfig.findUnique({ where: { moduleId } });
    if (!existed) {
      return null;
    }
    const row = await prisma.taskModuleConfig.update({
      where: { moduleId },
      data: {
        name: hasOwn(patch, "name") ? String(patch.name || "").trim() : undefined,
        category: hasOwn(patch, "category") ? String(patch.category || "REALTIME").trim().toUpperCase() : undefined,
        queueName: hasOwn(patch, "queueName") ? String(patch.queueName || "default").trim() : undefined,
        enabled: hasOwn(patch, "enabled") ? Boolean(patch.enabled) : undefined,
        schedule: hasOwn(patch, "schedule") ? (patch.schedule ? String(patch.schedule).trim() : null) : undefined,
        concurrency: hasOwn(patch, "concurrency") ? Math.max(1, Number(patch.concurrency) || 1) : undefined,
        attempts: hasOwn(patch, "attempts") ? Math.max(1, Number(patch.attempts) || 1) : undefined,
        backoffMs: hasOwn(patch, "backoffMs") ? Math.max(0, Number(patch.backoffMs) || 0) : undefined,
        useProxy: hasOwn(patch, "useProxy") ? Boolean(patch.useProxy) : undefined
      }
    });
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async createTaskRun(payload = {}) {
    const row = await prisma.taskRun.create({
      data: {
        moduleId: String(payload.moduleId || ""),
        queueName: String(payload.queueName || "default"),
        jobId: String(payload.jobId || ""),
        state: String(payload.state || "waiting"),
        attemptsMade: Number(payload.attemptsMade) || 0,
        progress: Number(payload.progress) || 0,
        payload: payload.payload || {},
        result: payload.result || undefined,
        error: payload.error ? String(payload.error) : null,
        orderGroupId: payload.orderGroupId ? String(payload.orderGroupId) : null,
        orderItemId: payload.orderItemId ? String(payload.orderItemId) : null,
        proxyId: payload.proxyId ? String(payload.proxyId) : null,
        startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
        finishedAt: payload.finishedAt ? new Date(payload.finishedAt) : null
      }
    });
    return {
      ...row,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async getTaskRunByQueueJob(queueName, jobId) {
    const row = await prisma.taskRun.findUnique({ where: { queueName_jobId: { queueName, jobId } } });
    if (!row) {
      return null;
    }
    return {
      ...row,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async updateTaskRunByQueueJob(queueName, jobId, patch = {}) {
    const existed = await prisma.taskRun.findUnique({ where: { queueName_jobId: { queueName, jobId } } });
    if (!existed) {
      return null;
    }
    const row = await prisma.taskRun.update({
      where: { queueName_jobId: { queueName, jobId } },
      data: {
        state: hasOwn(patch, "state") ? String(patch.state || existed.state) : undefined,
        attemptsMade: hasOwn(patch, "attemptsMade") ? Number(patch.attemptsMade) || 0 : undefined,
        progress: hasOwn(patch, "progress") ? Number(patch.progress) || 0 : undefined,
        result: hasOwn(patch, "result") ? patch.result : undefined,
        error: hasOwn(patch, "error") ? (patch.error ? String(patch.error) : null) : undefined,
        proxyId: hasOwn(patch, "proxyId") ? (patch.proxyId ? String(patch.proxyId) : null) : undefined,
        startedAt: hasOwn(patch, "startedAt") ? (patch.startedAt ? new Date(patch.startedAt) : null) : undefined,
        finishedAt: hasOwn(patch, "finishedAt") ? (patch.finishedAt ? new Date(patch.finishedAt) : null) : undefined
      }
    });
    return {
      ...row,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  },
  async listTaskRuns(filters = {}) {
    const where = {};
    if (filters.moduleId) {
      where.moduleId = String(filters.moduleId);
    }
    if (filters.state) {
      where.state = String(filters.state);
    }
    if (filters.queueName) {
      where.queueName = String(filters.queueName);
    }
    if (filters.orderGroupId) {
      where.orderGroupId = String(filters.orderGroupId);
    }
    const limit = Math.max(1, Math.min(200, Number(filters.limit) || 50));
    const rows = await prisma.taskRun.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return rows.map((row) => ({
      ...row,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
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
