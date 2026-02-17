import { randomUUID } from "node:crypto";

const now = () => new Date().toISOString();

const users = [
  {
    id: "u_admin",
    username: "admin",
    name: "系统管理员",
    role: "ADMIN",
    status: "ACTIVE",
    createdAt: "2026-01-01"
  },
  {
    id: "u_demo",
    username: "demo",
    name: "演示用户",
    role: "USER",
    status: "ACTIVE",
    createdAt: "2026-01-10"
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
    return clone(users);
  },
  createUser(payload) {
    const item = {
      id: randomUUID(),
      username: payload.username,
      name: payload.name,
      role: payload.role || "USER",
      status: payload.status || "ACTIVE",
      createdAt: now().slice(0, 10)
    };
    users.push(item);
    return clone(item);
  },
  updateUser(id, patch) {
    const idx = users.findIndex((it) => it.id === id);
    if (idx < 0) {
      return null;
    }
    users[idx] = { ...users[idx], ...patch };
    return clone(users[idx]);
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
  }
};
