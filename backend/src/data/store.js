import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

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

const users = [
  {
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
    createdAt: "2026-01-01",
    approvedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "u_demo",
    username: "demo",
    name: "演示用户",
    password: hashPassword("123456"),
    role: "USER",
    status: "ACTIVE",
    permissions: createDefaultPermissions(),
    createdAt: "2026-01-10",
    approvedAt: "2026-01-10T00:00:00.000Z"
  }
];

const poolAccounts = [
  {
    id: "pool_001",
    phone: "13800000001",
    auth: {
      loginToken: "token_pool_001"
    },
    profile: {
      remark: "演示账号"
    },
    capabilities: {
      isPlatinum: false,
      isNewUser: true,
      corporateBindings: []
    },
    wallet: {
      points: 1200,
      breakfastCoupons: 1,
      roomUpgradeCoupons: 0,
      lateCheckoutCoupons: 0,
      slippersCoupons: 0
    },
    runtime: {
      isOnline: true,
      dailyOrdersLeft: 5,
      lastExecution: {},
      lastResult: {}
    },
    createdAt: "2026-01-20T00:00:00.000Z",
    updatedAt: "2026-01-20T00:00:00.000Z"
  }
];

const orders = [];
const tasks = [];
const blacklistRecords = [
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
    date: "2023-10-05",
    createdAt: "2023-10-05T10:00:00.000Z",
    updatedAt: "2023-10-05T10:00:00.000Z"
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
    date: "2023-09-15",
    createdAt: "2023-09-15T10:00:00.000Z",
    updatedAt: "2023-09-15T10:00:00.000Z"
  }
];
const sessions = new Map();

const clone = (value) => JSON.parse(JSON.stringify(value));

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

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

const deriveTier = (capabilities) => {
  if (capabilities.corporateBindings.length > 0) {
    return "CORPORATE";
  }
  if (capabilities.isPlatinum) {
    return "PLATINUM";
  }
  if (capabilities.isNewUser) {
    return "NEW_USER";
  }
  return "NORMAL";
};

const deriveStatus = (runtime) => (runtime.isOnline ? "ACTIVE" : "OFFLINE");

const projectPoolAccount = (entity) => {
  const tier = deriveTier(entity.capabilities);
  const status = deriveStatus(entity.runtime);
  const corporateNames = entity.capabilities.corporateBindings.map((it) => it.name);

  return {
    id: entity.id,
    phone: entity.phone,
    token: entity.auth.loginToken,
    is_online: entity.runtime.isOnline,
    remark: entity.profile.remark || null,
    is_platinum: entity.capabilities.isPlatinum,
    is_corp_user: entity.capabilities.corporateBindings.length > 0,
    is_new_user: entity.capabilities.isNewUser,
    corporate_agreements: entity.capabilities.corporateBindings,
    corporateName: corporateNames[0],
    breakfast_coupons: entity.wallet.breakfastCoupons,
    room_upgrade_coupons: entity.wallet.roomUpgradeCoupons,
    late_checkout_coupons: entity.wallet.lateCheckoutCoupons,
    tier,
    status,
    points: entity.wallet.points,
    coupons: {
      breakfast: entity.wallet.breakfastCoupons,
      upgrade: entity.wallet.roomUpgradeCoupons,
      lateCheckout: entity.wallet.lateCheckoutCoupons,
      slippers: entity.wallet.slippersCoupons
    },
    dailyOrdersLeft: entity.runtime.dailyOrdersLeft,
    lastExecution: entity.runtime.lastExecution,
    lastResult: entity.runtime.lastResult,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt
  };
};

const normalizePoolPayload = (payload, existing = null) => {
  const base =
    existing || {
      id: randomUUID(),
      phone: "",
      auth: { loginToken: "" },
      profile: { remark: null },
      capabilities: { isPlatinum: false, isNewUser: false, corporateBindings: [] },
      wallet: { points: 0, breakfastCoupons: 0, roomUpgradeCoupons: 0, lateCheckoutCoupons: 0, slippersCoupons: 0 },
      runtime: { isOnline: false, dailyOrdersLeft: 0, lastExecution: {}, lastResult: {} },
      createdAt: now(),
      updatedAt: now()
    };

  const next = clone(base);

  if (hasOwn(payload, "phone")) {
    next.phone = String(payload.phone || "").trim();
  }
  if (hasOwn(payload, "token")) {
    next.auth.loginToken = String(payload.token || "").trim();
  }
  if (hasOwn(payload, "remark")) {
    next.profile.remark = payload.remark ? String(payload.remark) : null;
  }
  if (hasOwn(payload, "is_online")) {
    next.runtime.isOnline = Boolean(payload.is_online);
  }
  if (hasOwn(payload, "is_platinum")) {
    next.capabilities.isPlatinum = Boolean(payload.is_platinum);
  }
  if (hasOwn(payload, "is_new_user")) {
    next.capabilities.isNewUser = Boolean(payload.is_new_user);
  }
  if (hasOwn(payload, "corporate_agreements")) {
    next.capabilities.corporateBindings = normalizeCorporateBindings(
      payload.corporate_agreements,
      next.capabilities.corporateBindings
    );
  }

  if (hasOwn(payload, "is_corp_user") && !payload.is_corp_user && !hasOwn(payload, "corporate_agreements")) {
    next.capabilities.corporateBindings = [];
  }

  if (hasOwn(payload, "breakfast_coupons")) {
    next.wallet.breakfastCoupons = Math.max(0, Number(payload.breakfast_coupons) || 0);
  }
  if (hasOwn(payload, "room_upgrade_coupons")) {
    next.wallet.roomUpgradeCoupons = Math.max(0, Number(payload.room_upgrade_coupons) || 0);
  }
  if (hasOwn(payload, "late_checkout_coupons")) {
    next.wallet.lateCheckoutCoupons = Math.max(0, Number(payload.late_checkout_coupons) || 0);
  }
  if (hasOwn(payload, "points")) {
    next.wallet.points = Math.max(0, Number(payload.points) || 0);
  }
  if (hasOwn(payload, "dailyOrdersLeft")) {
    next.runtime.dailyOrdersLeft = Math.max(0, Number(payload.dailyOrdersLeft) || 0);
  }

  next.updatedAt = now();
  return next;
};

export const store = {
  sessions,
  users,
  poolAccounts,
  orders,
  tasks,
  blacklistRecords,
  createSession(user) {
    const token = randomUUID();
    sessions.set(token, { userId: user.id, role: user.role, createdAt: now() });
    return token;
  },
  getSession(token) {
    return sessions.get(token) || null;
  },
  deleteSession(token) {
    sessions.delete(token);
  },
  listUsers() {
    return clone(users.map((it) => {
      const safe = { ...it };
      delete safe.password;
      return safe;
    }));
  },
  getUserByUsername(username) {
    return users.find((it) => it.username === username) || null;
  },
  verifyUserPassword(user, plainPassword) {
    return verifyPassword(plainPassword, user?.password);
  },
  createRegistration(payload) {
    const item = {
      id: randomUUID(),
      username: payload.username,
      name: payload.name,
      password: hashPassword(payload.password),
      role: "USER",
      status: "PENDING",
      permissions: createDefaultPermissions(),
      createdAt: now().slice(0, 10),
      approvedAt: null
    };
    users.push(item);
    const safe = { ...item };
    delete safe.password;
    return clone(safe);
  },
  createUser(payload) {
    const item = {
      id: randomUUID(),
      username: payload.username,
      name: payload.name,
      password: hashPassword(payload.password || "123456"),
      role: payload.role || "USER",
      status: payload.status || "ACTIVE",
      permissions: normalizePermissions(payload.permissions, createDefaultPermissions()),
      createdAt: now().slice(0, 10),
      approvedAt: payload.status === "ACTIVE" ? now() : null
    };
    users.push(item);
    const safe = { ...item };
    delete safe.password;
    return clone(safe);
  },
  updateUser(id, patch) {
    const idx = users.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }

    const next = {
      ...users[idx],
      ...patch,
      permissions: patch.permissions
        ? normalizePermissions(patch.permissions, users[idx].permissions || createDefaultPermissions())
        : users[idx].permissions
    };

    if (patch.password) {
      next.password = hashPassword(patch.password);
    }

    if (patch.status === "ACTIVE" && !users[idx].approvedAt) {
      next.approvedAt = now();
    }

    users[idx] = next;
    const safe = { ...next };
    delete safe.password;
    return clone(safe);
  },
  listPoolAccounts(filters = {}) {
    let items = poolAccounts;
    if (filters.search) {
      const keyword = String(filters.search).toLowerCase();
      items = items.filter(
        (it) =>
          it.phone.toLowerCase().includes(keyword) ||
          String(it.profile.remark || "").toLowerCase().includes(keyword) ||
          it.capabilities.corporateBindings.some((corp) => corp.name.toLowerCase().includes(keyword))
      );
    }
    if (filters.is_online !== undefined) {
      const online = String(filters.is_online) === "true";
      items = items.filter((it) => it.runtime.isOnline === online);
    }
    if (filters.tier) {
      items = items.filter((it) => deriveTier(it.capabilities) === filters.tier);
    }
    return clone(items.map(projectPoolAccount));
  },
  getPoolAccount(id) {
    const item = poolAccounts.find((it) => it.id === id);
    return item ? clone(projectPoolAccount(item)) : null;
  },
  isPoolTokenTaken(token, excludeId = null) {
    return poolAccounts.some((it) => it.auth.loginToken === token && it.id !== excludeId);
  },
  createPoolAccount(payload) {
    const normalized = normalizePoolPayload(payload, null);
    const item = { ...normalized, id: randomUUID(), createdAt: now(), updatedAt: now() };
    poolAccounts.push(item);
    return clone(projectPoolAccount(item));
  },
  updatePoolAccount(id, patch) {
    const idx = poolAccounts.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }
    const merged = normalizePoolPayload(patch, poolAccounts[idx]);
    poolAccounts[idx] = merged;
    return clone(projectPoolAccount(poolAccounts[idx]));
  },
  deletePoolAccount(id) {
    const idx = poolAccounts.findIndex((it) => it.id === id);
    if (idx < 0) {
      return false;
    }
    poolAccounts.splice(idx, 1);
    return true;
  },
  createOrder(payload, creator) {
    const item = {
      id: randomUUID(),
      hotelName: payload.hotelName,
      customerName: payload.customerName,
      price: payload.price,
      status: "PROCESSING",
      creatorId: creator.id,
      creatorName: creator.name,
      createdAt: now()
    };
    orders.unshift(item);
    return clone(item);
  },
  listOrders() {
    return clone(orders);
  },
  updateOrder(id, patch) {
    const idx = orders.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }
    orders[idx] = { ...orders[idx], ...patch };
    return clone(orders[idx]);
  },
  createTask(orderId) {
    const item = {
      id: randomUUID(),
      orderId,
      state: "waiting",
      progress: 0,
      error: null,
      result: null,
      createdAt: now(),
      updatedAt: now()
    };
    tasks.unshift(item);
    return clone(item);
  },
  getTask(id) {
    const item = tasks.find((it) => it.id === id);
    return item ? clone(item) : null;
  },
  updateTask(id, patch) {
    const idx = tasks.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }
    tasks[idx] = { ...tasks[idx], ...patch, updatedAt: now() };
    return clone(tasks[idx]);
  },
  listBlacklistRecords(filters = {}) {
    let items = blacklistRecords;

    if (filters.search) {
      const keyword = String(filters.search).toLowerCase();
      items = items.filter(
        (it) =>
          it.hotelName.toLowerCase().includes(keyword) ||
          it.chainId.toLowerCase().includes(keyword) ||
          it.reason.toLowerCase().includes(keyword) ||
          it.tags.some((tag) => tag.toLowerCase().includes(keyword))
      );
    }

    if (filters.chainId) {
      const chainId = String(filters.chainId).toLowerCase();
      items = items.filter((it) => it.chainId.toLowerCase() === chainId);
    }

    if (filters.severity) {
      items = items.filter((it) => it.severity === filters.severity);
    }

    if (filters.status) {
      items = items.filter((it) => it.status === filters.status);
    }

    return clone(items.sort((a, b) => b.date.localeCompare(a.date)));
  },
  getBlacklistRecord(id) {
    const item = blacklistRecords.find((it) => it.id === id);
    return item ? clone(item) : null;
  },
  createBlacklistRecord(payload, reporter) {
    const item = {
      id: randomUUID(),
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
      date: payload.date || now().slice(0, 10),
      createdAt: now(),
      updatedAt: now()
    };
    blacklistRecords.unshift(item);
    return clone(item);
  },
  updateBlacklistRecord(id, patch) {
    const idx = blacklistRecords.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }

    const next = {
      ...blacklistRecords[idx],
      ...patch,
      updatedAt: now()
    };

    if (patch.tags) {
      next.tags = Array.from(new Set(patch.tags.map((it) => String(it).trim()).filter(Boolean)));
    }

    blacklistRecords[idx] = next;
    return clone(next);
  },
  deleteBlacklistRecord(id) {
    const idx = blacklistRecords.findIndex((it) => it.id === id);
    if (idx < 0) {
      return false;
    }
    blacklistRecords.splice(idx, 1);
    return true;
  },
  listBlacklistHotels(filters = {}) {
    const map = new Map();
    const severityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };

    this.listBlacklistRecords(filters).forEach((record) => {
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
      record.tags.forEach((tag) => current.tags.add(tag));

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
  checkBlacklistedHotel(chainId, hotelName) {
    const chain = String(chainId || "").toLowerCase();
    const name = String(hotelName || "").toLowerCase();
    const activeRecords = blacklistRecords.filter(
      (it) =>
        it.status === "ACTIVE" &&
        ((chain && it.chainId.toLowerCase() === chain) || (name && it.hotelName.toLowerCase() === name))
    );

    const severityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    const maxSeverity = activeRecords.reduce(
      (acc, cur) => (severityWeight[cur.severity] > severityWeight[acc] ? cur.severity : acc),
      "LOW"
    );

    return {
      blacklisted: activeRecords.length > 0,
      count: activeRecords.length,
      maxSeverity,
      records: clone(activeRecords)
    };
  }
};
